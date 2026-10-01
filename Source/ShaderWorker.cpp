/**
 * @file ShaderWorker.cpp
 * @brief Off-thread compile and link of fragment programs (see ShaderWorker.h).
 */
#include "ShaderWorker.h"
#include "textfile.h"
#include <QtCore/QThread>
#include <QtGui/QOpenGLContext>
#include <QtGui/QOffscreenSurface>
#include <condition_variable>
#include <deque>
#include <mutex>
#include <cstdio>
#include <cstdlib>
#include <vector>

namespace {

struct Job  { std::string key, src; };
struct Done { std::string key; GLuint prog; };

std::mutex              s_m;
std::condition_variable s_cv;
std::deque<Job>         s_jobs;
std::deque<Done>        s_done;
QOpenGLContext         *s_ctx   = nullptr;   ///< the worker's context (lives on the worker thread)
QOpenGLContext         *s_share = nullptr;   ///< the main context it shares with
QOffscreenSurface      *s_surf  = nullptr;
bool                    s_running = false;

/** @brief Prints a shader's or program's info log (worker thread). */
void printLog( GLuint obj, bool program )
{
	GLint n = 0;
	if( program ) glGetProgramiv( obj, GL_INFO_LOG_LENGTH, &n );
	else          glGetShaderiv( obj, GL_INFO_LOG_LENGTH, &n );
	if( n <= 1 ) return;
	std::vector<char> log( (size_t) n + 1, 0 );
	if( program ) glGetProgramInfoLog( obj, n, NULL, log.data() );
	else          glGetShaderInfoLog( obj, n, NULL, log.data() );
	fprintf( stderr, "%s\n", log.data() );
}

class Worker : public QThread
{
protected:
	void run() override
	{
		if( !s_ctx->makeCurrent( s_surf ) )
		{
			fprintf( stderr, "SHADER: worker context could not be made current\n" );
			return;
		}
		// The shared fullscreen vertex shader, compiled once in this context.
		GLuint vs = 0;
		if( GLchar *v = textFileRead( "..\\Engine\\Fullscreen.vert" ) )
		{
			vs = glCreateShader( GL_VERTEX_SHADER );
			glShaderSource( vs, 1, const_cast<const GLchar**>( &v ), NULL );
			free( v );
			glCompileShader( vs );
		}
		for( ;; )
		{
			Job j;
			{
				std::unique_lock<std::mutex> lk( s_m );
				s_cv.wait( lk, [] { return !s_jobs.empty(); } );
				j = std::move( s_jobs.front() );
				s_jobs.pop_front();
			}
			GLuint prog = glCreateProgram();
			GLuint fs = glCreateShader( GL_FRAGMENT_SHADER );
			const GLchar *p = j.src.c_str();
			glShaderSource( fs, 1, &p, NULL );
			glCompileShader( fs );
			GLint ok = 0;
			glGetShaderiv( fs, GL_COMPILE_STATUS, &ok );
			if( ok )
			{
				glAttachShader( prog, vs );
				glAttachShader( prog, fs );
				glLinkProgram( prog );
				glGetProgramiv( prog, GL_LINK_STATUS, &ok );   // blocks HERE, not on the render thread
			}
			if( !ok )
			{
				fprintf( stderr, "SHADER: worker build failed: %.120s\n", j.key.c_str() );
				printLog( fs, false );
				printLog( prog, true );
				glDeleteProgram( prog );
				prog = 0;
			}
			glDeleteShader( fs );         // flagged: freed with the program
			glFinish();                   // the program is complete before the render thread sees it
			std::lock_guard<std::mutex> lk( s_m );
			s_done.push_back( { j.key, prog } );
		}
	}
};
Worker *s_worker = nullptr;

} // namespace

bool shaderWorkerStart( QOpenGLContext *share )
{
	if( s_running ) return true;
	// only for the experimental chain-lab variants (KALEIDO_SPEC=1)
	if( !getenv( "KALEIDO_SPEC" ) || getenv( "KALEIDO_NO_SHADER_WORKER" ) || !share ) return false;
	s_surf = new QOffscreenSurface();
	s_surf->setFormat( share->format() );
	s_surf->create();
	s_ctx = new QOpenGLContext();
	s_ctx->setFormat( share->format() );
	s_ctx->setShareContext( share );
	if( !s_surf->isValid() || !s_ctx->create() || !QOpenGLContext::areSharing( s_ctx, share ) )
	{
		fprintf( stderr, "SHADER: compile worker unavailable (no shared context)\n" );
		delete s_ctx; s_ctx = nullptr;
		delete s_surf; s_surf = nullptr;
		return false;
	}
	s_share  = share;
	s_worker = new Worker();
	s_ctx->moveToThread( s_worker );
	s_worker->start( QThread::LowPriority );
	s_running = true;
	fprintf( stderr, "SHADER: compile worker on (own shared context)\n" );
	return true;
}

bool shaderWorkerUsable()
{
	if( !s_running ) return false;
	QOpenGLContext *cur = QOpenGLContext::currentContext();
	return cur && ( cur == s_share || QOpenGLContext::areSharing( cur, s_share ) );
}

void shaderWorkerSubmit( const std::string &key, const std::string &fragSource )
{
	{
		std::lock_guard<std::mutex> lk( s_m );
		s_jobs.push_back( { key, fragSource } );
	}
	s_cv.notify_one();
}

bool shaderWorkerCollect( std::string &key, GLuint &prog )
{
	std::lock_guard<std::mutex> lk( s_m );
	if( s_done.empty() ) return false;
	key  = s_done.front().key;
	prog = s_done.front().prog;
	s_done.pop_front();
	return true;
}
