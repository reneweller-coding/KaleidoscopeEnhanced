/*****************************************************************************\
 *                              VideoIn
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Implementation of VideoIn: Qt6Multimedia-backed playlist playback, frame-to-GL-texture upload, and end-of-clip
 *  advance.
 *
 *  @author René Weller
 */

#include "glcore.h"
#include "VideoIn.h"

// Module-qualified on purpose: the project lists each Qt module's include
// directory separately and QtMultimedia is not among them, but the parent
// $(QTDIR)\include is — so this form resolves without touching the build.
#include <QtMultimedia/QMediaPlayer>
#include <QtMultimedia/QVideoSink>
#include <QtMultimedia/QVideoFrame>
#include <QtMultimedia/QAudioOutput>
#include <QImage>
#include <QDir>
#include <QFileInfo>
#include <QStringList>
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

/** Process-wide video decoder/playlist state.
 *
 * One decoder for the whole process, created on first use.  The player, the
 * playlist and the GL texture live on the GUI thread, which also renders --
 * but the decoded FRAMES do not: QVideoSink::videoFrameChanged is emitted on
 * Qt's FFmpeg render thread, and the frame callback (a connect() without a
 * context object) runs there.  This struct used to say the opposite and held
 * the newest frame in a plain member; the music-video PiP, built the same way,
 * crashed in glTexSubImage2D because of it on 20.11.2026 (see VideoPiP.cpp and
 * docs/engine-internals.md, "Video frames cross threads").  So the frame is
 * handed over under `lock`, and videoInFrame() uploads from its own reference.
 **/
struct VideoState
{
    QMediaPlayer *player = nullptr; ///< The single Qt6Multimedia decoder/player, created on first videoInInit() call.
    QVideoSink   *sink = nullptr;   ///< Receives decoded frames from player via videoFrameChanged.
    QAudioOutput *audio = nullptr;  ///< muted; the visualiser has its own sound

    QStringList files; ///< The current playlist (one entry for a single file, or every playable file in a directory).
    int         index = 0;  ///< Index into files of the clip currently playing.
    QString     openedPath; ///< The path last passed to videoInInit(), used to detect a redundant re-init as a no-op.

    QMutex lock;          ///< Guards `pending` and `dirty`, the only members the frame callback writes.
    QImage pending;       ///< newest decoded frame not yet uploaded, RGBA (null once videoInFrame() took it)
    bool   dirty = false; ///< a frame arrived since the last upload

    std::atomic<long long> decoded{ 0 }; ///< Frames converted by the callback since the last init (for the log).
    long long              uploaded = 0; ///< Frames uploaded since the last init (GUI thread only; for the log).

    GLuint tex = 0;        ///< GL texture holding the last-uploaded frame; 0 until the first upload.
    int    texW = 0;       ///< Width of tex as last allocated; used to decide glTexImage2D vs. glTexSubImage2D.
    int    texH = 0;       ///< Height of tex as last allocated.
    bool   failed = false; ///< Set once videoInInit() found nothing playable; latches further calls to fail fast.
};

VideoState g; ///< The (sole) process-wide VideoState instance; see its class comment for the threading rationale.

/** Sets the player's source to the playlist entry at g.index and starts playback. */
void playCurrent()
{
    if ( g.files.isEmpty() || !g.player )
        return;
    if ( g.index >= g.files.size() )
        g.index = 0;
    g.player->setSource( QUrl::fromLocalFile( g.files[g.index] ) );
    g.player->play();
}

} // namespace

bool videoInInit( const char *path )
{
    // g.failed latches permanently once set: after any call finds nothing playable, EVERY later
    // call fails immediately without even inspecting the new path, until videoInRelease() resets
    // it. Only one video source is configured per app run in practice, so this is not revisited.
    if ( g.failed )
        return false;
    QString p = QString::fromLocal8Bit( path );
    if ( g.player && p == g.openedPath )
        return true; // already running on this path

    QFileInfo   fi( p );
    QStringList files;
    if ( fi.isDir() )
    {
        // Every container Qt is likely to have a backend for.  Unsupported
        // files simply never produce a frame and the playlist moves on.
        QStringList pats;
        pats << "*.mp4" << "*.m4v" << "*.mov" << "*.mkv" << "*.avi"
             << "*.webm" << "*.wmv" << "*.mpg" << "*.mpeg";
        QDir d( p );
        for ( const QString &f : d.entryList( pats, QDir::Files, QDir::Name ) )
            files << d.absoluteFilePath( f );
    }
    else if ( fi.isFile() )
    {
        files << fi.absoluteFilePath();
    }

    if ( files.isEmpty() )
    {
        fprintf( stderr, "video input: nothing playable at '%s'\n", path );
        g.failed = true;
        return false;
    }

    if ( !g.player )
    {
        g.player = new QMediaPlayer();
        g.sink = new QVideoSink();
        g.audio = new QAudioOutput();
        // Muted on purpose: the point of a video source is its PICTURE, and
        // its soundtrack would fight the music the visuals are reacting to.
        g.audio->setMuted( true );
        g.player->setAudioOutput( g.audio );
        g.player->setVideoSink( g.sink );

        // No explicit context object on these connect() calls: the lambdas only touch the
        // process-wide `g` (never dangling), and g.sink/g.player are torn down together in
        // videoInRelease(), so there is no risk of a callback firing against a deleted object.
        // Without a context object a lambda runs on the emitting thread -- for the frame callback
        // that is Qt's FFmpeg render thread (the log says so once per run), hence the lock below.
        QObject::connect( g.sink, &QVideoSink::videoFrameChanged,
                          []( const QVideoFrame &frame )
        {
            if ( !frame.isValid() )
                return;
            // toImage() converts whatever the decoder produced — NV12, YUV420,
            // something planar — into plain RGB.  Mapping the frame directly
            // would be faster but would mean handling every pixel format the
            // platform might hand over, and this is a texture source, not the
            // main render path.
            QImage img = frame.toImage();
            if ( img.isNull() )
                return;
            if ( img.format() != QImage::Format_RGBA8888 )
                img = img.convertToFormat( QImage::Format_RGBA8888 );
            if ( g.decoded.fetch_add( 1 ) == 0 )
                fprintf( stderr, "video input: first frame on %s\n",
                         QThread::currentThread() == QCoreApplication::instance()->thread()
                             ? "the GUI thread"
                             : "a decoder thread, not the GUI thread" );
            {
                QMutexLocker locker( &g.lock );
                g.pending.swap( img ); // img now holds the frame nobody took; freed on return, outside the lock
                g.dirty = true;
            }
        } );

        // End of a clip: step to the next file, or restart a single one.
        QObject::connect( g.player, &QMediaPlayer::mediaStatusChanged,
                          []( QMediaPlayer::MediaStatus s )
        {
            if ( s == QMediaPlayer::EndOfMedia )
            {
                g.index = ( g.index + 1 ) % qMax( 1, g.files.size() );
                playCurrent();
            }
        } );
    }

    g.files = files;
    g.index = 0;
    g.openedPath = p;
    playCurrent();
    fprintf( stderr, "video input: %d file(s) from '%s'\n",
             static_cast<int>( files.size() ), path );
    return true;
}

unsigned int videoInFrame( unsigned int *width, unsigned int *height )
{
    // Take the newest frame out under the lock; `frame` then holds its own
    // reference, so a frame arriving during the upload cannot free its pixels.
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
        return 0; // nothing decoded yet

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

        // Reallocate only when the size actually changes — which it does when a
        // playlist steps from one clip to the next.
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

void videoInRelease()
{
    if ( g.player )
    {
        g.player->stop();
        delete g.player;
        g.player = nullptr;
        delete g.sink;
        g.sink = nullptr;
        delete g.audio;
        g.audio = nullptr;
        fprintf( stderr, "video input: released after %lld frames decoded, %lld uploaded\n",
                 g.decoded.load(), g.uploaded );
    }
    if ( g.tex )
    {
        glDeleteTextures( 1, &g.tex );
        g.tex = 0;
    }
    {
        QMutexLocker locker( &g.lock ); // after the player is gone: stopping it waits for the callback
        g.pending = QImage();
        g.dirty = false;
    }
    g.decoded = 0;
    g.uploaded = 0;
    g.files.clear();
    g.openedPath.clear();
    g.texW = g.texH = 0;
}
