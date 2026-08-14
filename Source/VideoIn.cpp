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

#include <cstdio>

namespace {

// One decoder for the whole process, created on first use.  Everything here
// lives on the GUI thread: QMediaPlayer emits its frames there, and paint()
// runs there too, so the newest frame can simply be held in a member with no
// lock at all.  Adding one would only add a way to get it wrong.
struct VideoState
{
	QMediaPlayer  *player = nullptr;
	QVideoSink    *sink   = nullptr;
	QAudioOutput  *audio  = nullptr;   // muted; the visualiser has its own sound

	QStringList    files;
	int            index  = 0;
	QString        openedPath;

	QImage         latest;             // newest decoded frame, RGBA
	bool           dirty  = false;     // a frame arrived since the last upload
	GLuint         tex    = 0;
	int            texW   = 0, texH = 0;
	bool           failed = false;
};

VideoState g;

void playCurrent()
{
	if( g.files.isEmpty() || !g.player )
		return;
	if( g.index >= g.files.size() )
		g.index = 0;
	g.player->setSource( QUrl::fromLocalFile( g.files[g.index] ) );
	g.player->play();
}

} // namespace

bool videoInInit( const char *path )
{
	if( g.failed )
		return false;
	QString p = QString::fromLocal8Bit( path );
	if( g.player && p == g.openedPath )
		return true;                       // already running on this path

	QFileInfo fi( p );
	QStringList files;
	if( fi.isDir() )
	{
		// Every container Qt is likely to have a backend for.  Unsupported
		// files simply never produce a frame and the playlist moves on.
		QStringList pats;
		pats << "*.mp4" << "*.m4v" << "*.mov" << "*.mkv" << "*.avi"
		     << "*.webm" << "*.wmv" << "*.mpg" << "*.mpeg";
		QDir d( p );
		for( const QString &f : d.entryList( pats, QDir::Files, QDir::Name ) )
			files << d.absoluteFilePath( f );
	}
	else if( fi.isFile() )
	{
		files << fi.absoluteFilePath();
	}

	if( files.isEmpty() )
	{
		fprintf( stderr, "video input: nothing playable at '%s'\n", path );
		g.failed = true;
		return false;
	}

	if( !g.player )
	{
		g.player = new QMediaPlayer();
		g.sink   = new QVideoSink();
		g.audio  = new QAudioOutput();
		// Muted on purpose: the point of a video source is its PICTURE, and
		// its soundtrack would fight the music the visuals are reacting to.
		g.audio->setMuted( true );
		g.player->setAudioOutput( g.audio );
		g.player->setVideoSink( g.sink );

		QObject::connect( g.sink, &QVideoSink::videoFrameChanged,
		                  [] ( const QVideoFrame &frame )
		{
			if( !frame.isValid() )
				return;
			// toImage() converts whatever the decoder produced — NV12, YUV420,
			// something planar — into plain RGB.  Mapping the frame directly
			// would be faster but would mean handling every pixel format the
			// platform might hand over, and this is a texture source, not the
			// main render path.
			QImage img = frame.toImage();
			if( img.isNull() )
				return;
			if( img.format() != QImage::Format_RGBA8888 )
				img = img.convertToFormat( QImage::Format_RGBA8888 );
			g.latest = img;
			g.dirty  = true;
		} );

		// End of a clip: step to the next file, or restart a single one.
		QObject::connect( g.player, &QMediaPlayer::mediaStatusChanged,
		                  [] ( QMediaPlayer::MediaStatus s )
		{
			if( s == QMediaPlayer::EndOfMedia )
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
	         int(files.size()), path );
	return true;
}

unsigned int videoInFrame( unsigned int *width, unsigned int *height )
{
	if( !g.dirty && g.tex == 0 )
		return 0;                          // nothing decoded yet

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

		// Reallocate only when the size actually changes — which it does when a
		// playlist steps from one clip to the next.
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

void videoInRelease()
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
	g.files.clear();
	g.openedPath.clear();
	g.texW = g.texH = 0;
	g.dirty = false;
}
