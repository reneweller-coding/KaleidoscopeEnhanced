/**
 * @file ShaderForge.cpp
 * @brief Helper-process program builds with a disk cache of program binaries (see ShaderForge.h).
 */
#include "ShaderForge.h"
#include "textfile.h"
#include <QtCore/QCoreApplication>
#include <QtCore/QDir>
#include <QtCore/QFile>
#include <QtCore/QFileInfo>
#include <QtCore/QProcess>
#include <QtCore/QElapsedTimer>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <map>
#ifndef _WIN32
#include <signal.h>
#endif

namespace {

struct Entry
{
	GLuint prog = 0;
	bool   failed = false;
	bool   launched = false;
	qint64 pid = 0;
#ifdef _WIN32
	HANDLE proc = nullptr;      ///< the helper, opened at launch (its pid cannot be reused while we hold it)
#endif
};

bool                          s_init = false, s_ok = false;
QString                       s_helper, s_dir, s_vert;
std::string                   s_salt;        ///< GPU, driver and vertex shader: part of every key
std::map<std::string, Entry>  s_entries;
int                           s_running = 0;

std::string keyOf( const std::string &src )
{
	unsigned long long h = 1469598103934665603ULL;          // FNV-1a 64
	auto mix = [&]( const std::string &t ) { for( unsigned char c : t ) { h ^= c; h *= 1099511628211ULL; } };
	mix( s_salt );
	mix( src );
	char b[32];
	snprintf( b, sizeof b, "%016llx", h );
	return b;
}

/// @return True while the helper building @p e is still alive.
bool helperRunning( Entry &e )
{
#ifdef _WIN32
	if( !e.proc ) return false;
	if( WaitForSingleObject( e.proc, 0 ) == WAIT_TIMEOUT ) return true;
	CloseHandle( e.proc );
	e.proc = nullptr;
	return false;
#else
	return e.pid > 0 && ::kill( (pid_t) e.pid, 0 ) == 0;
#endif
}

GLuint loadBinary( const QString &path )
{
	QFile f( path );
	if( !f.open( QIODevice::ReadOnly ) ) return 0;
	const QByteArray b = f.readAll();
	if( b.size() < 8 || !b.startsWith( "KFRG" ) ) return 0;
	GLenum format = 0;
	memcpy( &format, b.constData() + 4, 4 );
	GLuint prog = glCreateProgram();
	glProgramBinary( prog, format, b.constData() + 8, (GLsizei) ( b.size() - 8 ) );
	GLint ok = 0;
	glGetProgramiv( prog, GL_LINK_STATUS, &ok );
	if( !ok ) { glDeleteProgram( prog ); return 0; }        // another driver: build again
	return prog;
}

} // namespace

bool shaderForgeInit()
{
	if( s_init ) return s_ok;
	s_init = true;
	if( getenv( "KALEIDO_NO_FORGE" ) || !glProgramBinary ) return false;
	// The helper is this executable itself (both executables answer --forge):
	// the driver keeps the finished GPU code in a disk cache per executable,
	// and the helper's warm draw has to fill the one this process reads --
	// with PresetEditor.exe as the helper every new program still cost
	// ~120 ms at its first draw here.
	s_helper = QCoreApplication::applicationFilePath();
	s_vert = QFileInfo( "..\\Engine\\Fullscreen.vert" ).absoluteFilePath();
	const char *la = getenv( "LOCALAPPDATA" );
	if( s_helper.isEmpty() || !la || !QFileInfo::exists( s_vert ) ) return false;
	s_dir = QString::fromLocal8Bit( la ) + "/KaleidoscopeVisualizer/ShaderCache";
	if( !QDir().mkpath( s_dir ) ) return false;
	const char *r = (const char *) glGetString( GL_RENDERER );
	const char *v = (const char *) glGetString( GL_VERSION );
	s_salt = std::string( r ? r : "?" ) + "|" + ( v ? v : "?" ) + "|";
	if( char *vs = textFileRead( "..\\Engine\\Fullscreen.vert" ) ) { s_salt += vs; free( vs ); }
	s_ok = true;
	fprintf( stderr, "SHADER: forge on (%s)\n", qPrintable( s_helper ) );
	return true;
}

bool shaderForgeAvailable() { return s_ok; }

GLuint shaderForgeGet( const std::string &fragSource, bool *failed, int targets )
{
	if( failed ) *failed = false;
	if( !s_ok ) { if( failed ) *failed = true; return 0; }
	const std::string key = keyOf( fragSource + "|targets" + std::to_string( targets ) );
	Entry &e = s_entries[key];
	if( e.prog ) return e.prog;
	if( e.failed ) { if( failed ) *failed = true; return 0; }
	// The binary is taken only once its helper has ENDED: the driver writes the
	// GPU code of the helper's warm draw to its own disk cache at process exit,
	// and a binary loaded before that still cost 180 ms at its first draw
	// (1 s later: 6 ms -- measured 01.10.2026).
	if( e.launched && helperRunning( e ) ) return 0;
	const QString base = s_dir + "/" + QString::fromStdString( key );
	if( QFileInfo::exists( base + ".bin" ) )
	{
		QElapsedTimer t; t.start();
		e.prog = loadBinary( base + ".bin" );
		if( e.launched ) { e.launched = false; --s_running; }
		if( e.prog )
		{
			if( getenv( "KALEIDO_SPEC_LOG" ) ) fprintf( stderr, "FORGE load %s: %.1f ms\n", key.c_str(), t.nsecsElapsed() * 1e-6 );
			return e.prog;
		}
		QFile::remove( base + ".bin" );                       // stale (another driver): build again below
	}
	if( QFileInfo::exists( base + ".err" ) )
	{
		QFile f( base + ".err" );
		if( f.open( QIODevice::ReadOnly ) )
			fprintf( stderr, "SHADER: forge build failed (%s):\n%s\n", key.c_str(), f.readAll().left( 2000 ).constData() );
		e.failed = true;
		if( e.launched ) { e.launched = false; --s_running; }
		if( failed ) *failed = true;
		return 0;
	}
	if( e.launched )                                         // helper gone without a result: crashed
	{
		fprintf( stderr, "SHADER: forge helper ended without a result (%s)\n", key.c_str() );
		e.launched = false;
		--s_running;
		e.failed = true;
		if( failed ) *failed = true;
		return 0;
	}
	if( !e.launched && s_running < 1 )   // one at a time: two at once dropped the app to 13 fps
	{
		QFile src( base + ".frag" );
		if( !src.open( QIODevice::WriteOnly ) ) { e.failed = true; return 0; }
		src.write( fragSource.data(), (qint64) fragSource.size() );
		src.close();
		QElapsedTimer tl; tl.start();
		const bool started = QProcess::startDetached( s_helper, { "--forge", QDir::toNativeSeparators( base + ".frag" ),
		                                                          QDir::toNativeSeparators( base + ".bin" ),
		                                                          QString::number( targets ),
		                                                          QDir::toNativeSeparators( s_vert ) },
		                                            QString(), &e.pid );
		if( getenv( "KALEIDO_SPEC_LOG" ) ) fprintf( stderr, "FORGE launch %s: %.1f ms\n", key.c_str(), tl.nsecsElapsed() * 1e-6 );
		if( started )
		{
			e.launched = true;
			++s_running;
#ifdef _WIN32
			e.proc = OpenProcess( SYNCHRONIZE, FALSE, (DWORD) e.pid );
#endif
		}
		else
			e.failed = true;
	}
	return 0;
}
