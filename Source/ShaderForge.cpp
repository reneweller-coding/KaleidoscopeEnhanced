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

namespace {

struct Entry
{
	GLuint prog = 0;
	bool   failed = false;
	bool   queued = false;      ///< handed to the helper, result not there yet
};

bool                          s_init = false, s_ok = false;
QString                       s_helper, s_dir, s_vert;
std::string                   s_salt;        ///< GPU, driver and vertex shader: part of every key
std::map<std::string, Entry>  s_entries;
QProcess                     *s_server = nullptr;
int                           s_serverStarts = 0;

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

/**
 * @brief The helper, started once (this executable with --forge-serve) and fed one job per line.
 *
 * One process for the whole session: a helper per program created a GL
 * context each time, and every creation cost the app two frame gaps of ~55 ms
 * (measured 02.10.2026).  If it dies, it is started again (at most three
 * times) and every job still waiting is handed over once more.
 * @return The running helper, or nullptr.
 */
QProcess *server()
{
	if( s_server && s_server->state() != QProcess::NotRunning )
		return s_server;
	if( s_server )
	{
		fprintf( stderr, "SHADER: forge helper ended (exit %d) -- starting it again\n", s_server->exitCode() );
		delete s_server;
		s_server = nullptr;
		for( auto &kv : s_entries ) kv.second.queued = false;   // hand the waiting jobs over again
	}
	if( s_serverStarts >= 3 )
		return nullptr;
	++s_serverStarts;
	s_server = new QProcess();
	s_server->setStandardOutputFile( QProcess::nullDevice() );
	s_server->setStandardErrorFile( QProcess::nullDevice() );
	s_server->start( s_helper, { "--forge-serve" } );
	if( !s_server->waitForStarted( 3000 ) )
	{
		fprintf( stderr, "SHADER: forge helper did not start\n" );
		delete s_server;
		s_server = nullptr;
		return nullptr;
	}
	return s_server;
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
	// and the helper's warm draw has to fill the one this process reads in its
	// next sessions -- with PresetEditor.exe as the helper every new program
	// still cost ~120 ms at its first draw here.
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
	// Started now, with the app's own start: its GL context is made once, here.
	if( !server() ) return false;
	s_ok = true;
	fprintf( stderr, "SHADER: forge on (%s --forge-serve)\n", qPrintable( s_helper ) );
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
	const QString base = s_dir + "/" + QString::fromStdString( key );
	if( QFileInfo::exists( base + ".bin" ) )                  // appears by a rename: never half-written
	{
		QElapsedTimer t; t.start();
		e.prog = loadBinary( base + ".bin" );
		e.queued = false;
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
		e.queued = false;
		if( failed ) *failed = true;
		return 0;
	}
	QProcess *sv = server();                                 // (a helper started again clears every queued flag)
	if( !sv ) { e.failed = true; if( failed ) *failed = true; return 0; }
	if( !e.queued )
	{
		QFile src( base + ".frag" );
		if( !src.open( QIODevice::WriteOnly ) ) { e.failed = true; return 0; }
		src.write( fragSource.data(), (qint64) fragSource.size() );
		src.close();
		const QString job = QDir::toNativeSeparators( base + ".frag" ) + "\t" + QDir::toNativeSeparators( base + ".bin" ) + "\t"
		                    + QString::number( targets ) + "\t" + QDir::toNativeSeparators( s_vert ) + "\n";
		sv->write( job.toLocal8Bit() );
		e.queued = true;
		if( getenv( "KALEIDO_SPEC_LOG" ) ) fprintf( stderr, "FORGE queue %s\n", key.c_str() );
	}
	return 0;
}
