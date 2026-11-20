/*****************************************************************************\
 *                              VideoPiP
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Implementation of VideoPiP: same decode-to-GL-texture shape as VideoIn.cpp, plus seek/play-state control for
 *  staying in sync with the actual song position.
 *
 *  @author René Weller
 */

#include "glcore.h"
#include "VideoPiP.h"

#include <QtMultimedia/QMediaPlayer>
#include <QtMultimedia/QVideoSink>
#include <QtMultimedia/QVideoFrame>
#include <QtMultimedia/QAudioOutput>
#include <QImage>
#include <QFileInfo>
#include <QUrl>
#include <QObject>
#include <QMutex>
#include <QMutexLocker>
#include <QThread>
#include <QCoreApplication>

#include <atomic>
#include <cstdio>

namespace
{

/** Process-wide PiP decoder state: a second, independent instance from VideoIn's `g` -- this one plays ALONGSIDE
 * the photo/video source, not instead of it.
 *
 * Two threads touch it.  The player, the GL texture and everything else live on the GUI thread, which also renders;
 * but QVideoSink::videoFrameChanged is emitted on Qt's FFmpeg render thread, and the connect() in videoPipLoad()
 * has no context object, so the frame callback runs THERE.  Until 20.11.2026 it swapped a plain QImage member
 * while the GUI thread was handing that image's pixels to glTexSubImage2D: the old frame was freed under the
 * driver's feet, and a 720p frame (3.7 MB, its own VirtualAlloc block) turned that into an access violation within
 * a minute (docs/engine-internals.md, "Video frames cross threads").  Now the callback only ever writes `pending`
 * under `lock`, and videoPipFrame() takes the frame out under the lock and uploads it from its own reference,
 * outside the lock -- the decoder never waits for the driver, and the driver never reads a freed frame.
 **/
struct PipState
{
    QMediaPlayer *player = nullptr; ///< The PiP's Qt6Multimedia player, created by the first videoPipLoad().
    QVideoSink   *sink = nullptr;   ///< Receives the decoded frames from player.
    QAudioOutput *audio = nullptr;  ///< muted; this is a silent visual, the song itself is the soundtrack

    QString openedPath; ///< The path last passed to videoPipLoad(), used to detect a redundant re-load as a no-op.

    QMutex lock;          ///< Guards `pending` and `dirty`, the only members the frame callback writes.
    QImage pending;       ///< Newest decoded frame not yet uploaded (null once videoPipFrame() took it).
    bool   dirty = false; ///< A frame arrived since the last upload.

    std::atomic<long long> decoded{ 0 }; ///< Frames converted by the callback since the last load (for the log).
    long long              uploaded = 0; ///< Frames uploaded since the last load (GUI thread only; for the log).

    GLuint tex = 0;  ///< GL texture holding the last uploaded frame; 0 until the first upload.
    int    texW = 0; ///< Width of tex as last allocated.
    int    texH = 0; ///< Height of tex as last allocated.
};

PipState g; ///< The process-wide PiP state.

} // namespace

bool videoPipLoad( const char *path )
{
    QString p = QString::fromLocal8Bit( path );
    if ( g.player && p == g.openedPath )
        return true; // already running on this path

    QFileInfo fi( p );
    if ( !fi.isFile() )
    {
        fprintf( stderr, "video PiP: not a file: '%s'\n", path );
        return false;
    }

    if ( !g.player )
    {
        g.player = new QMediaPlayer();
        g.sink = new QVideoSink();
        g.audio = new QAudioOutput();
        g.audio->setMuted( true );
        g.player->setAudioOutput( g.audio );
        g.player->setVideoSink( g.sink );
        g.player->setLoops( QMediaPlayer::Infinite ); // a short official video against a longer song just loops

        // No explicit context object, so the lambda runs on the thread that
        // emits -- Qt's FFmpeg render thread, not the GUI thread (see
        // PipState).  The expensive part, the YUV-to-RGBA conversion, stays
        // there, outside the lock; only the hand-over is locked.  g.sink is
        // torn down in videoPipRelease() after the player that fires it.
        QObject::connect( g.sink, &QVideoSink::videoFrameChanged,
                          []( const QVideoFrame &frame )
        {
            if ( !frame.isValid() )
                return;
            QImage img = frame.toImage();
            if ( img.isNull() )
                return;
            if ( img.format() != QImage::Format_RGBA8888 )
                img = img.convertToFormat( QImage::Format_RGBA8888 );
            if ( g.decoded.fetch_add( 1 ) == 0 )
                fprintf( stderr, "video PiP: first frame on %s\n",
                         QThread::currentThread() == QCoreApplication::instance()->thread()
                             ? "the GUI thread"
                             : "a decoder thread, not the GUI thread" );
            {
                QMutexLocker locker( &g.lock );
                g.pending.swap( img ); // img now holds the frame nobody took; freed on return, outside the lock
                g.dirty = true;
            }
        } );
    }

    g.openedPath = p;
    g.player->setSource( QUrl::fromLocalFile( fi.absoluteFilePath() ) );
    g.player->play();
    fprintf( stderr, "video PiP: playing '%s'\n", path );
    return true;
}

void videoPipSeek( long long ms, long long toleranceMs )
{
    if ( !g.player )
        return;
    // Also covers "player hasn't started reporting a position yet"
    // (position() reads 0 before the first frame): a genuine seek to near
    // 0 is harmless to skip once playback begins and self-corrects within
    // one tolerance window.
    const qint64 cur = g.player->position();
    if ( cur < ms - toleranceMs || cur > ms + toleranceMs )
        g.player->setPosition( static_cast<qint64>( ms ) );
}

void videoPipSetPlaying( bool playing )
{
    if ( !g.player )
        return;
    if ( playing && g.player->playbackState() != QMediaPlayer::PlayingState )
        g.player->play();
    else if ( !playing && g.player->playbackState() == QMediaPlayer::PlayingState )
        g.player->pause();
}

unsigned int videoPipFrame( unsigned int *width, unsigned int *height )
{
    // Take the newest frame out under the lock; from here on `frame` holds
    // its own reference, so a frame the callback delivers DURING the upload
    // lands in g.pending and cannot free these pixels.
    QImage frame;
    {
        QMutexLocker locker( &g.lock );
        if ( g.dirty )
        {
            frame.swap( g.pending );
            g.dirty = false;
        }
    }
    if ( frame.isNull() && g.tex == 0 )
        return 0;

    if ( !frame.isNull() )
    {
        const int w = frame.width(), h = frame.height();
        if ( g.tex == 0 )
        {
            glGenTextures( 1, &g.tex );
            glBindTexture( GL_TEXTURE_2D, g.tex );
            glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR );
            glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR );
            glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE );
            glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE );
        }
        else
        {
            glBindTexture( GL_TEXTURE_2D, g.tex );
        }

        if ( w != g.texW || h != g.texH )
        {
            glTexImage2D( GL_TEXTURE_2D, 0, GL_RGBA, w, h, 0,
                          GL_RGBA, GL_UNSIGNED_BYTE, frame.constBits() );
            g.texW = w;
            g.texH = h;
        }
        else
        {
            glTexSubImage2D( GL_TEXTURE_2D, 0, 0, 0, w, h,
                             GL_RGBA, GL_UNSIGNED_BYTE, frame.constBits() );
        }
        glBindTexture( GL_TEXTURE_2D, 0 );
        ++g.uploaded;
    }

    if ( width )
        *width = static_cast<unsigned int>( g.texW );
    if ( height )
        *height = static_cast<unsigned int>( g.texH );
    return g.tex;
}

void videoPipRelease()
{
    if ( g.player )
    {
        // The player first: deleting it stops Qt's decoder threads before the
        // sink goes (a late frame would still only land in g.pending, under
        // the lock).  Not under g.lock itself -- the callback takes that lock,
        // and stopping the threads waits for the callback.
        g.player->stop();
        delete g.player;
        g.player = nullptr;
        delete g.sink;
        g.sink = nullptr;
        delete g.audio;
        g.audio = nullptr;
        fprintf( stderr, "video PiP: released after %lld frames decoded, %lld uploaded\n",
                 g.decoded.load(), g.uploaded );
    }
    if ( g.tex )
    {
        glDeleteTextures( 1, &g.tex );
        g.tex = 0;
    }
    {
        QMutexLocker locker( &g.lock );
        g.pending = QImage();
        g.dirty = false;
    }
    g.decoded = 0;
    g.uploaded = 0;
    g.openedPath.clear();
    g.texW = g.texH = 0;
}
