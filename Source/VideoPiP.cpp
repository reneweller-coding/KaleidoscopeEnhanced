/**
 * @file VideoPiP.cpp
 * @brief Implementation of VideoPiP: same decode-to-GL-texture shape as VideoIn.cpp, plus seek/play-state control for staying in sync with the actual song position.
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

#include <cstdio>

namespace {

/**
 * @brief Process-wide PiP decoder state -- see VideoIn.cpp's VideoState for the same unsynchronized-on-the-GUI-thread rationale. A second, independent instance from VideoIn's `g`: this one plays ALONGSIDE the photo/video source, not instead of it.
 */
struct PipState
{
	QMediaPlayer  *player = nullptr;
	QVideoSink    *sink   = nullptr;
	QAudioOutput  *audio  = nullptr;   // muted; this is a silent visual, the song itself is the soundtrack

	QString        openedPath;         ///< The path last passed to videoPipLoad(), used to detect a redundant re-load as a no-op.

	QImage         latest;
	bool           dirty  = false;
	GLuint         tex    = 0;
	int            texW   = 0, texH = 0;
};

PipState g;

} // namespace

bool videoPipLoad( const char *path )
{
	QString p = QString::fromLocal8Bit( path );
	if( g.player && p == g.openedPath )
		return true;                       // already running on this path

	QFileInfo fi( p );
	if( !fi.isFile() )
	{
		fprintf( stderr, "video PiP: not a file: '%s'\n", path );
		return false;
	}

	if( !g.player )
	{
		g.player = new QMediaPlayer();
		g.sink   = new QVideoSink();
		g.audio  = new QAudioOutput();
		g.audio->setMuted( true );
		g.player->setAudioOutput( g.audio );
		g.player->setVideoSink( g.sink );
		g.player->setLoops( QMediaPlayer::Infinite );   // a short official video against a longer song just loops

		// No explicit context object: the lambda only touches the process-wide
		// `g`, and g.sink is torn down in videoPipRelease() together with the
		// player that would otherwise fire it.
		QObject::connect( g.sink, &QVideoSink::videoFrameChanged,
		                  [] ( const QVideoFrame &frame )
		{
			if( !frame.isValid() )
				return;
			QImage img = frame.toImage();
			if( img.isNull() )
				return;
			if( img.format() != QImage::Format_RGBA8888 )
				img = img.convertToFormat( QImage::Format_RGBA8888 );
			g.latest = img;
			g.dirty  = true;
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
	if( !g.player )
		return;
	// Also covers "player hasn't started reporting a position yet"
	// (position() reads 0 before the first frame): a genuine seek to near
	// 0 is harmless to skip once playback begins and self-corrects within
	// one tolerance window.
	const qint64 cur = g.player->position();
	if( cur < ms - toleranceMs || cur > ms + toleranceMs )
		g.player->setPosition( qint64(ms) );
}

void videoPipSetPlaying( bool playing )
{
	if( !g.player )
		return;
	if( playing && g.player->playbackState() != QMediaPlayer::PlayingState )
		g.player->play();
	else if( !playing && g.player->playbackState() == QMediaPlayer::PlayingState )
		g.player->pause();
}

unsigned int videoPipFrame( unsigned int *width, unsigned int *height )
{
	if( !g.dirty && g.tex == 0 )
		return 0;

	if( g.dirty && !g.latest.isNull() )
	{
		const int w = g.latest.width(), h = g.latest.height();
		if( g.tex == 0 )
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

		if( w != g.texW || h != g.texH )
		{
			glTexImage2D( GL_TEXTURE_2D, 0, GL_RGBA, w, h, 0,
			              GL_RGBA, GL_UNSIGNED_BYTE, g.latest.constBits() );
			g.texW = w; g.texH = h;
		}
		else
		{
			glTexSubImage2D( GL_TEXTURE_2D, 0, 0, 0, w, h,
			                 GL_RGBA, GL_UNSIGNED_BYTE, g.latest.constBits() );
		}
		glBindTexture( GL_TEXTURE_2D, 0 );
		g.dirty = false;
	}

	if( width  ) *width  = (unsigned int) g.texW;
	if( height ) *height = (unsigned int) g.texH;
	return g.tex;
}

void videoPipRelease()
{
	if( g.player )
	{
		g.player->stop();
		delete g.player; g.player = nullptr;
		delete g.sink;   g.sink   = nullptr;
		delete g.audio;  g.audio  = nullptr;
	}
	if( g.tex )
	{
		glDeleteTextures( 1, &g.tex );
		g.tex = 0;
	}
	g.latest = QImage();
	g.openedPath.clear();
	g.texW = g.texH = 0;
	g.dirty = false;
}
