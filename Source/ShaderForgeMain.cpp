/**
 * @file ShaderForgeMain.cpp
 * @brief The helper side of ShaderForge: "--forge" builds a program binary, "--forgeload" times loading one.
 *
 * Kept apart from ShaderForge.cpp: this file draws through Qt's GL functions,
 * the app side through glcore's entry points, and the two must not meet in
 * one translation unit.
 */
#include "ShaderForgeMain.h"
#ifdef _WIN32
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#endif
#include <QtGui/QGuiApplication>
#include <QtGui/QOffscreenSurface>
#include <QtGui/QOpenGLContext>
#include <QtGui/QOpenGLExtraFunctions>
#include <QtGui/QSurfaceFormat>
#include <QtCore/QElapsedTimer>
#include <QtCore/QFile>
#include <QtCore/QStringList>
#include <cstdio>
#include <cstring>
#include <memory>

namespace {

/// One draw of the fullscreen triangle into @p targets RGBA32F colour targets of @p size pixels.
double drawInto( QOpenGLExtraFunctions *gl, GLuint prog, int targets, int size )
{
	GLuint fbo = 0, vao = 0, tex[4] = {};
	targets = qBound( 1, targets, 4 );
	gl->glGenFramebuffers( 1, &fbo );
	gl->glBindFramebuffer( GL_FRAMEBUFFER, fbo );
	gl->glGenTextures( targets, tex );
	GLenum bufs[4];
	for( int i = 0; i < targets; ++i )
	{
		gl->glBindTexture( GL_TEXTURE_2D, tex[i] );
		gl->glTexImage2D( GL_TEXTURE_2D, 0, GL_RGBA32F, size, size, 0, GL_RGBA, GL_FLOAT, nullptr );
		gl->glFramebufferTexture2D( GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0 + i, GL_TEXTURE_2D, tex[i], 0 );
		bufs[i] = GL_COLOR_ATTACHMENT0 + i;
	}
	gl->glDrawBuffers( targets, bufs );
	gl->glViewport( 0, 0, size, size );
	gl->glGenVertexArrays( 1, &vao );
	gl->glBindVertexArray( vao );
	gl->glUseProgram( prog );
	QElapsedTimer t; t.start();
	gl->glDrawArrays( GL_TRIANGLES, 0, 3 );
	gl->glFinish();
	const double ms = t.nsecsElapsed() * 1e-6;
	gl->glBindVertexArray( 0 );
	gl->glBindFramebuffer( GL_FRAMEBUFFER, 0 );
	gl->glDeleteVertexArrays( 1, &vao );
	gl->glDeleteTextures( targets, tex );
	gl->glDeleteFramebuffers( 1, &fbo );
	return ms;
}

bool readAll( const QString &path, QByteArray &o )
{
	QFile f( path );
	if( !f.open( QIODevice::ReadOnly ) ) return false;
	o = f.readAll();
	return true;
}

/// @brief Builds one program (compile, link, warm draw into @p targets RGBA32F targets) and writes its binary to @p out
/// (via out.tmp and a rename), or out.err with the log.  @return 0 on success.
int forgeOne( QOpenGLExtraFunctions *gl, const QString &frag, const QString &out, int targets, const QString &vert )
{
	auto fail = [&]( const QByteArray &why ) {
		QFile e( out + ".err" );
		if( e.open( QIODevice::WriteOnly ) ) e.write( why );
		fprintf( stderr, "FORGE FAIL %s\n%s\n", qPrintable( frag ), why.constData() );
		return 1;
	};
	QByteArray vs, fs;
	if( !readAll( vert, vs ) ) return fail( "cannot read " + vert.toLocal8Bit() );
	if( !readAll( frag, fs ) ) return fail( "cannot read " + frag.toLocal8Bit() );
	auto compile = [&]( GLenum type, const QByteArray &src, QByteArray *log ) -> GLuint {
		GLuint sh = gl->glCreateShader( type );
		const char *ptr = src.constData();
		const GLint len = GLint( src.size() );
		gl->glShaderSource( sh, 1, &ptr, &len );
		gl->glCompileShader( sh );
		GLint ok = 0; gl->glGetShaderiv( sh, GL_COMPILE_STATUS, &ok );
		if( ok ) return sh;
		GLint n = 0; gl->glGetShaderiv( sh, GL_INFO_LOG_LENGTH, &n );
		QByteArray b( n > 1 ? n : 1, '\0' );
		if( n > 1 ) gl->glGetShaderInfoLog( sh, n, nullptr, b.data() );
		*log = b;
		gl->glDeleteShader( sh );
		return 0;
	};
	QByteArray log;
	const GLuint v = compile( GL_VERTEX_SHADER, vs, &log );
	if( !v ) return fail( "vertex: " + log );
	const GLuint f = compile( GL_FRAGMENT_SHADER, fs, &log );
	if( !f ) return fail( log );
	const GLuint prog = gl->glCreateProgram();
	gl->glAttachShader( prog, v );
	gl->glAttachShader( prog, f );
	gl->glProgramParameteri( prog, GL_PROGRAM_BINARY_RETRIEVABLE_HINT, GL_TRUE );
	gl->glLinkProgram( prog );
	GLint ok = 0; gl->glGetProgramiv( prog, GL_LINK_STATUS, &ok );
	if( !ok )
	{
		GLint n = 0; gl->glGetProgramiv( prog, GL_INFO_LOG_LENGTH, &n );
		QByteArray b( n > 1 ? n : 1, '\0' );
		if( n > 1 ) gl->glGetProgramInfoLog( prog, n, nullptr, b.data() );
		return fail( "link: " + b );
	}
	// Warm draw.  The program binary carries the compiled shader, but the
	// NVIDIA driver finishes the GPU code only at the first draw (the 3D lab's
	// geometry: 45-180 ms) and keeps that in its own disk cache, one per
	// executable -- which is why the app forges with its own exe.  The driver
	// reads that cache only when a process starts (measured 01.10.2026): this
	// draw spares the app's NEXT sessions the cost, not the running one.
	drawInto( gl, prog, targets, 4 );

	GLint len = 0; gl->glGetProgramiv( prog, GL_PROGRAM_BINARY_LENGTH, &len );
	if( len <= 0 ) return fail( "no program binary" );
	QByteArray bin( len, '\0' );
	GLenum format = 0;
	gl->glGetProgramBinary( prog, len, &len, &format, bin.data() );
	QFile o( out + ".tmp" );
	if( !o.open( QIODevice::WriteOnly ) ) return fail( "cannot write " + out.toLocal8Bit() );
	o.write( "KFRG", 4 );
	o.write( reinterpret_cast<const char *>( &format ), 4 );
	o.write( bin.constData(), len );
	o.close();
	QFile::remove( out );
	const bool renamed = QFile::rename( out + ".tmp", out );
	gl->glDeleteProgram( prog );                    // the server forges many: nothing may pile up
	gl->glDeleteShader( v );
	gl->glDeleteShader( f );
	if( !renamed ) return fail( "cannot rename to " + out.toLocal8Bit() );
	return 0;
}

} // namespace

bool shaderForgeIsCommand( int argc, char *argv[] )
{
	return argc >= 2 && ( !strcmp( argv[1], "--forge" ) || !strcmp( argv[1], "--forgeload" ) || !strcmp( argv[1], "--forge-serve" ) );
}

int shaderForgeMain( int argc, char *argv[] )
{
	QStringList args;
	for( int i = 1; i < argc; ++i ) args << QString::fromLocal8Bit( argv[i] );
	const bool load = args.value( 0 ) == "--forgeload", serve = args.value( 0 ) == "--forge-serve";
	if( ( load && args.size() < 2 ) || ( !load && !serve && args.size() < 5 ) )
	{
		fprintf( stderr, "usage: --forge <frag> <out.bin> <targets> <vert>  |  --forge-serve  |  --forgeload <bin> [targets]\n" );
		return 2;
	}

	QSurfaceFormat fmt;
	fmt.setVersion( 4, 3 );
	fmt.setProfile( QSurfaceFormat::CoreProfile );
	fmt.setRenderableType( QSurfaceFormat::OpenGL );
	std::unique_ptr<QGuiApplication> app;
	if( !QCoreApplication::instance() ) app.reset( new QGuiApplication( argc, argv ) );
	QOffscreenSurface surf;
	surf.setFormat( fmt );
	surf.create();
	QOpenGLContext ctx;
	ctx.setFormat( fmt );
	if( !ctx.create() || !ctx.makeCurrent( &surf ) )
	{
		fprintf( stderr, "FORGE: no GL context\n" );
		return 2;
	}
	QOpenGLExtraFunctions *gl = ctx.extraFunctions();

	if( load )
	{
		QByteArray b;
		if( !readAll( args[1], b ) ) return 3;
		if( b.size() < 8 || !b.startsWith( "KFRG" ) ) return 4;
		GLenum format = 0;
		memcpy( &format, b.constData() + 4, 4 );
		QElapsedTimer t; t.start();
		GLuint prog = gl->glCreateProgram();
		gl->glProgramBinary( prog, format, b.constData() + 8, GLsizei( b.size() - 8 ) );
		GLint ok = 0; gl->glGetProgramiv( prog, GL_LINK_STATUS, &ok );
		fprintf( stderr, "FORGELOAD %s: %s in %.2f ms (%d bytes)\n", qPrintable( args[1] ), ok ? "ok" : "FAILED",
		         t.nsecsElapsed() * 1e-6, int( b.size() ) );
		if( !ok ) return 5;
		// Does this executable's driver cache already hold the GPU code? (cold: 45-180 ms, warm: ~5 ms)
		fprintf( stderr, "FORGELOAD first draw: %.2f ms with finish\n", drawInto( gl, prog, args.value( 2 ).toInt(), 64 ) );
		return 0;
	}

	if( serve )
	{
#ifdef _WIN32
		SetPriorityClass( GetCurrentProcess(), BELOW_NORMAL_PRIORITY_CLASS );
#endif
		// One job per line on stdin: frag \t out.bin \t targets \t vert.  The
		// context is made once; the app reads the results from the files (the
		// .bin appears by a rename, so it is never seen half-written).
		char line[4096];
		while( fgets( line, sizeof line, stdin ) )
		{
			const QStringList f = QString::fromLocal8Bit( line ).trimmed().split( '\t' );
			if( f.size() < 4 ) continue;
			forgeOne( gl, f[0], f[1], f[2].toInt(), f[3] );
			fprintf( stdout, "done\n" );
			fflush( stdout );
		}
		return 0;
	}
#ifdef _WIN32
	// A guest beside the running app: two helpers at normal priority took it down to 13 fps for a second.
	SetPriorityClass( GetCurrentProcess(), BELOW_NORMAL_PRIORITY_CLASS );
#endif
	return forgeOne( gl, args[1], args[2], args[3].toInt(), args[4] );
}
