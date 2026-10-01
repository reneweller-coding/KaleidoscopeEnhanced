/**
 * @file shader_setup.cpp
 * @brief Implementation of shader_setup.h: file-based GLSL source loading, per-stage compile/link diagnostics, and the fragment-only / vertex+fragment / full-pipeline / compute program builders.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>


#include "textfile.h"
#include "shader_setup.h"
#include "ShaderWorker.h"

#include <map>
#include <string>
#include <chrono>
#include <cstdlib>

// Opengl feedback about shaders

/**
 * @brief Prints a shader's compile status and info log (if any) to stderr.
 * @param sh_id The GL shader object to query (must already have glCompileShader called on it).
 */
void printShaderInfoLog(GLuint sh_id)
{
    GLint infologLength = 0, status;
    GLsizei charsWritten  = 0;
    char *infoLog;

	glGetShaderiv( sh_id, GL_COMPILE_STATUS, &status );
	fprintf(stderr, "Compilation: %s\n", status ? "OK" : "FAILED!" );

	glGetShaderiv( sh_id, GL_INFO_LOG_LENGTH, &infologLength );
    if ( infologLength > 0 )
    {
        infoLog = (char *)malloc(infologLength);
        glGetShaderInfoLog(sh_id, infologLength, &charsWritten, infoLog);
		if ( strlen(infoLog) > 0 )
			fprintf(stderr, "InfoLog: %s\n",infoLog);
        free(infoLog);
    }
}

/**
 * @brief Prints a program's link status and info log (if any) to stderr.
 * @param prog_id The GL program object to query (must already have glLinkProgram called on it).
 */
void printProgramInfoLog(GLuint prog_id)
{
    GLint infologLength = 0, status;
    GLsizei charsWritten  = 0;
    char *infoLog;

	glGetProgramiv( prog_id, GL_LINK_STATUS, &status );
	fprintf(stderr, "Linking: %s\n", status ? "OK" : "FAILED!" );

	glGetProgramiv(prog_id, GL_INFO_LOG_LENGTH,&infologLength);
    if (infologLength > 0)
    {
        infoLog = (char *)malloc(infologLength);
        glGetProgramInfoLog(prog_id, infologLength, &charsWritten, infoLog);
		if ( strlen(infoLog) > 0 )
			fprintf(stderr, "InfoLog: %s\n",infoLog);
        free(infoLog);
    }
}



// load & use shaders

/**
 * @brief Loads a shader source file into an already-created shader object, compiles it, logs the result, and attaches it to a program.
 *
 * Fails hard: a missing source file is treated as a broken installation, not a recoverable
 * condition, so this prints an error and calls exit(1) rather than returning an error code. A
 * compile failure, by contrast, is only logged (via printShaderInfoLog) — the shader is attached
 * regardless, and it is up to the caller to check the program's link status.
 * @param program_id The GL program to attach the compiled shader to.
 * @param shader_id An already-created (glCreateShader) shader object to fill and compile.
 * @param filename Path to the GLSL source file to load.
 */
void loadAttachShader( GLuint program_id, GLuint shader_id, const char * filename )
{
	GLchar * shadersource = textFileRead( filename );

	if ( shadersource == NULL )
	{
		fprintf(stderr,"Couldn't load shader source '%s' !\n", filename );
		exit(1);
	}
	glShaderSource( shader_id, 1, const_cast<const GLchar**>( &shadersource ), NULL );
	free(shadersource);
	glCompileShader( shader_id );
	printShaderInfoLog( shader_id );
	glAttachShader( program_id, shader_id );
}


// The ONE shared vertex shader for every fullscreen pass (core profile has
// no fixed-function vertex path): compiled once, attached to each program.
/**
 * @brief Returns the process-wide shared fullscreen-quad vertex shader, compiling it from Engine\\Fullscreen.vert on first call.
 *
 * Exits the process if the file is missing (see loadAttachShader()'s rationale — a missing engine
 * asset is a broken install).
 * @return The GL vertex shader object id (same value on every call after the first).
 */
static GLuint fullscreenVertShader()
{
	static GLuint vs = 0;
	if( vs == 0 )
	{
		vs = glCreateShader( GL_VERTEX_SHADER );
		GLchar *src = textFileRead( "..\\Engine\\Fullscreen.vert" );
		if( src == NULL )
		{
			fprintf( stderr, "FATAL: Engine\\Fullscreen.vert missing!\n" );
			exit( 1 );
		}
		glShaderSource( vs, 1, const_cast<const GLchar**>( &src ), NULL );
		free( src );
		glCompileShader( vs );
		printShaderInfoLog( vs );
	}
	return vs;
}

/**
 * @brief Links a program with its shaders attached; on link failure deletes it and returns 0.
 *
 * A program that fails to LINK (as opposed to a missing FILE, which
 * loadAttachShader() already treats as fatal) used to be returned anyway:
 * initUniforms() would resolve every uniform to -1 on it, and the first
 * glUseProgram() on that non-zero-but-unlinked id is invalid per the GL
 * spec, so the driver silently leaves whatever program was PREVIOUSLY bound
 * active — the broken scene ends up rendering the last-good scene's shader
 * under its own (wrong) audio-reactive parameters, with no diagnostic
 * beyond the easily-missed "Linking: FAILED!" log line. Returning 0 instead
 * (mirroring setShadersPipeline()'s existing convention below) turns that
 * into a clean glUseProgram(0) at draw time -- the broken scene just draws
 * nothing, which is what Scene3DShader's pipeline path already does today.
 * @param prog Program object with all stages attached, not yet linked.
 * @return @p prog (now linked and bound via glUseProgram) on success; 0 after deleting it on failure (the info log is printed either way).
 */
static GLuint linkOrFail( GLuint prog )
{
	glLinkProgram( prog );
	printProgramInfoLog( prog );
	GLint linked = 0;
	glGetProgramiv( prog, GL_LINK_STATUS, &linked );
	if( !linked )
	{
		glDeleteProgram( prog );
		return 0;
	}
	glUseProgram( prog );
	return prog;
}

// ---------------------------------------------------------------------------
// Program cache -- see the block comment in shader_setup.h for the why.
//
// Two maps: source-key -> program, and program -> reference count. The KEY map
// is what a rebuild consults; the REFCOUNT is what keeps a program alive. They
// are separate on purpose, and that is what makes hot-reload correct: dropping
// a key makes the next compile build afresh, while the scenes still holding the
// old program keep it until they let go.
//
// GL work is single-threaded here (the mesh warm-up worker loads geometry, not
// shaders), so no locking.
// ---------------------------------------------------------------------------
static std::map<std::string, GLuint> s_progByKey;   ///< source files -> linked program.
static std::map<GLuint, int>         s_progRefs;    ///< program -> how many callers hold it.
static int                           s_progReuses = 0;  ///< How often a build was answered from the cache.
static double                        s_progBuildMs = 0.0;  ///< Wall-clock ms spent in real compiles/links.

/** @brief Monotonic milliseconds; only ever used as a difference. */
static double nowMs()
{
	using namespace std::chrono;
	return duration<double, std::milli>(
	           steady_clock::now().time_since_epoch() ).count();
}

/** @brief Builds the cache key. The tag matters: setShaders() ignores its vert
 *         argument and always uses the shared fullscreen vertex shader, so its
 *         programs are NOT interchangeable with setShadersVF()'s. */
static std::string progKey( const char *tag, const char *a, const char *b,
                            const char *c, const char *d, const char *e )
{
	std::string k( tag );
	const char *parts[5] = { a, b, c, d, e };
	for( int i = 0; i < 5; ++i )
	{
		k += '|';
		if( parts[i] ) k += parts[i];
	}
	return k;
}

/** @brief KALEIDO_NO_SHADER_CACHE=1 turns the cache off without a rebuild.
 *
 *  Kept because the cache changes object LIFETIMES, and lifetime bugs are
 *  exactly the kind that get blamed on whatever changed last. Being able to
 *  A/B it inside one binary is the difference between attributing a fault
 *  and guessing at it. */
static bool cacheOff()
{
	static const bool off = ( getenv( "KALEIDO_NO_SHADER_CACHE" ) != 0 );
	return off;
}

/** @brief Cache lookup. Also re-binds, because the builders leave the program
 *         bound (linkOrFail does) and a hit must be indistinguishable from a
 *         build -- otherwise the GL state after the call depends on cache luck. */
static GLuint progLookup( const std::string &key )
{
	if( cacheOff() )
		return 0;
	std::map<std::string, GLuint>::iterator it = s_progByKey.find( key );
	if( it == s_progByKey.end() )
		return 0;
	++s_progRefs[it->second];
	++s_progReuses;
	glUseProgram( it->second );
	return it->second;
}

/** @brief Records a freshly built program. A failed build (0) is not cached --
 *         a later attempt should get the chance to fail loudly again. */
static GLuint progStore( const std::string &key, GLuint prog )
{
	// Name it for the debug callback while we still know which files went in.
	if( prog )
		glcoreNameProgram( (unsigned) prog, key.c_str() );
	if( prog && !cacheOff() )
	{
		s_progByKey[key] = prog;
		s_progRefs[prog] = 1;
	}
	return prog;
}

void shaderProgramRelease( GLuint prog )
{
	if( !prog )
		return;
	std::map<GLuint, int>::iterator r = s_progRefs.find( prog );
	if( r == s_progRefs.end() )
	{
		// Never came from the cache (or was already released): the caller owns it.
		glDeleteProgram( prog );
		return;
	}
	if( --r->second > 0 )
		return;
	for( std::map<std::string, GLuint>::iterator k = s_progByKey.begin();
	     k != s_progByKey.end(); ++k )
		if( k->second == prog ) { s_progByKey.erase( k ); break; }
	s_progRefs.erase( r );
	glDeleteProgram( prog );
}

int shaderCacheDrop( const char *bareFileName )
{
	if( !bareFileName || !*bareFileName )
		return 0;
	const std::string needle( bareFileName );
	int n = 0;
	std::map<std::string, GLuint>::iterator it = s_progByKey.begin();
	while( it != s_progByKey.end() )
	{
		if( it->first.find( needle ) != std::string::npos )
		{
			// Only the KEY goes. The program stays until its holders release it,
			// which is what lets several scenes reload one after another without
			// the first one deleting the shader the others are still drawing with.
			s_progByKey.erase( it++ );
			++n;
		}
		else
			++it;
	}
	return n;
}

void shaderCacheStats( int *programs, int *reuses, double *buildMs )
{
	if( programs ) *programs = (int) s_progByKey.size();
	if( reuses )   *reuses   = s_progReuses;
	if( buildMs )  *buildMs  = s_progBuildMs;
}
// ---------------------------------------------------------------------------
// Background builds (GL_KHR_parallel_shader_compile / GL_ARB_parallel_shader_compile).
//
// A plain compile blocks the render thread until the driver is done: a few ms
// for most scenes, but SECONDS for a chain lab when the driver's shader cache
// is cold (after every shader change, a driver update, a fresh install) -- the
// warm-up then froze the picture.  With the extension the driver compiles on
// its own threads: we hand it the source, link, and only ask the non-blocking
// GL_COMPLETION_STATUS until it is done; then the program goes into the cache.
// ---------------------------------------------------------------------------
#ifndef GL_COMPLETION_STATUS_KHR
#define GL_COMPLETION_STATUS_KHR 0x91B1
#endif
struct PrebuildJob { std::string key; GLuint prog; GLuint fs; };
static std::map<std::string, PrebuildJob> s_prebuild;
static int s_parallel = -1;                 ///< -1 unknown, 0 no, 1 yes
static bool parallelCompile()
{
	if( s_parallel >= 0 ) return s_parallel == 1;
	s_parallel = 0;
	if( const char *e = getenv( "KALEIDO_NO_PARALLEL_COMPILE" ) ) { (void)e; return false; }
	GLint n = 0;
	glGetIntegerv( GL_NUM_EXTENSIONS, &n );
	bool has = false;
	for( GLint i = 0; i < n && !has; ++i )
	{
		const char *ext = (const char *) glGetStringi( GL_EXTENSIONS, (GLuint) i );
		if( ext && ( !strcmp( ext, "GL_KHR_parallel_shader_compile" ) || !strcmp( ext, "GL_ARB_parallel_shader_compile" ) ) )
			has = true;
	}
	if( has )
	{
		typedef void (APIENTRY *MaxThreadsFn)( GLuint );
		MaxThreadsFn fn = (MaxThreadsFn) glcoreProc( "glMaxShaderCompilerThreadsKHR" );
		if( !fn ) fn = (MaxThreadsFn) glcoreProc( "glMaxShaderCompilerThreadsARB" );
		if( fn ) fn( 0xFFFFFFFFu );          // as many threads as the driver likes
		s_parallel = 1;
	}
	fprintf( stderr, "SHADER: background compile %s\n", s_parallel ? "on (parallel_shader_compile)" : "off" );
	return s_parallel == 1;
}

bool shaderPrebuildStart( const char *frag_source )
{
	if( !parallelCompile() ) return false;
	const std::string key = progKey( "FS", frag_source, 0, 0, 0, 0 );
	if( s_progByKey.count( key ) || s_prebuild.count( key ) ) return true;
	GLchar *src = textFileRead( frag_source );
	if( !src ) return false;
	PrebuildJob j;
	j.key  = key;
	j.prog = glCreateProgram();
	glAttachShader( j.prog, fullscreenVertShader() );
	j.fs = glCreateShader( GL_FRAGMENT_SHADER );
	glShaderSource( j.fs, 1, const_cast<const GLchar**>( &src ), NULL );
	free( src );
	glCompileShader( j.fs );                 // no status query: that would block
	glAttachShader( j.prog, j.fs );
	glLinkProgram( j.prog );
	s_prebuild[key] = j;
	return true;
}

static std::map<std::string, int> s_variantFailed;   ///< variant keys whose build failed (no retry)

int shaderPrebuildPoll()
{
	for( auto it = s_prebuild.begin(); it != s_prebuild.end(); )
	{
		GLint done = 0;
		glGetProgramiv( it->second.prog, GL_COMPLETION_STATUS_KHR, &done );
		if( !done ) { ++it; continue; }
		GLint linked = 0;
		const double tL0 = nowMs();
		glGetProgramiv( it->second.prog, GL_LINK_STATUS, &linked );
		if( getenv( "KALEIDO_SPEC_LOG" ) && nowMs() - tL0 > 5.0 )
			fprintf( stderr, "SPEC link status took %.1f ms\n", nowMs() - tL0 );
		if( !linked && it->second.key.compare( 0, 4, "FSV|" ) == 0 )
		{
			// a variant has no blocking twin that would log it later: log it now
			fprintf( stderr, "SHADER: variant build failed: %.120s\n", it->second.key.c_str() );
			printShaderInfoLog( it->second.fs );
			printProgramInfoLog( it->second.prog );
			s_variantFailed[it->second.key] = 1;
		}
		glDeleteShader( it->second.fs );     // flagged; freed with the program
		if( linked )
			progStore( it->second.key, it->second.prog );
		else
			glDeleteProgram( it->second.prog );   // the blocking path will build it again and log why
		it = s_prebuild.erase( it );
	}
	return (int) s_prebuild.size();
}

static std::map<std::string, int> s_workerPending;   ///< variant keys queued on the compile worker

bool shaderVariantStart( const char *frag_source, const std::string &defines )
{
	const std::string key = progKey( "FSV", frag_source, defines.c_str(), 0, 0, 0 );
	if( s_progByKey.count( key ) || s_prebuild.count( key ) || s_variantFailed.count( key ) || s_workerPending.count( key ) )
		return true;
	const bool worker = shaderWorkerUsable();
	if( !worker && !parallelCompile() ) return false;
	GLchar *src = textFileRead( frag_source );
	if( !src ) return false;
	std::string text( src );
	free( src );
	const size_t nl = text.find( '\n' );                  // after "#version ..."
	text.insert( nl == std::string::npos ? text.size() : nl + 1, defines );
	// The worker thread builds it start to finish: the driver's own background
	// compile still blocked ~0.8 s on the link-status query (ShaderWorker.h).
	if( worker )
	{
		shaderWorkerSubmit( key, text );
		s_workerPending[key] = 1;
		return true;
	}
	PrebuildJob j;
	j.key  = key;
	j.prog = glCreateProgram();
	glAttachShader( j.prog, fullscreenVertShader() );
	j.fs = glCreateShader( GL_FRAGMENT_SHADER );
	const GLchar *p = text.c_str();
	glShaderSource( j.fs, 1, &p, NULL );
	glCompileShader( j.fs );                 // no status query: that would block
	glAttachShader( j.prog, j.fs );
	glLinkProgram( j.prog );
	s_prebuild[key] = j;
	return true;
}

GLuint shaderVariantTake( const char *frag_source, const std::string &defines )
{
	std::string k;
	GLuint built = 0;
	while( shaderWorkerCollect( k, built ) )
	{
		s_workerPending.erase( k );
		if( built ) progStore( k, built );
		else        s_variantFailed[k] = 1;
	}
	shaderPrebuildPoll();
	const std::string key = progKey( "FSV", frag_source, defines.c_str(), 0, 0, 0 );
	auto it = s_progByKey.find( key );
	if( it == s_progByKey.end() ) return 0;
	++s_progRefs[it->second];
	return it->second;
}

bool shaderVariantFailed( const char *frag_source, const std::string &defines )
{
	return s_variantFailed.count( progKey( "FSV", frag_source, defines.c_str(), 0, 0, 0 ) ) != 0;
}

bool shaderPrebuildReady( const char *frag_source )
{
	return s_progByKey.count( progKey( "FS", frag_source, 0, 0, 0, 0 ) ) != 0;
}

GLuint setShaders( const char *vert_source, const char * frag_source )
{
	// Keyed on the FRAGMENT alone: this builder ignores vert_source.
	const std::string key = progKey( "FS", frag_source, 0, 0, 0, 0 );
	if( GLuint hit = progLookup( key ) ) return hit;
	const double t0 = nowMs();
	GLuint s_id, sh_prog_id;
	(void)vert_source;   // historical parameter; the shared fullscreen vert rules

	sh_prog_id = glCreateProgram();

	glAttachShader( sh_prog_id, fullscreenVertShader() );

	s_id = glCreateShader( GL_FRAGMENT_SHADER );
	loadAttachShader( sh_prog_id, s_id, frag_source );

	const GLuint built = linkOrFail( sh_prog_id );
	s_progBuildMs += nowMs() - t0;
	return progStore( key, built );
}

// Vertex + fragment pair (the REAL 3D scene effects): unlike setShaders()
// above, this one actually attaches the vertex shader.
GLuint setShadersVF( const char *vert_source, const char *frag_source )
{
	const std::string key = progKey( "VF", vert_source, frag_source, 0, 0, 0 );
	if( GLuint hit = progLookup( key ) ) return hit;
	const double t0 = nowMs();

	GLuint sh_prog_id = glCreateProgram();

	GLuint v_id = glCreateShader( GL_VERTEX_SHADER );
	loadAttachShader( sh_prog_id, v_id, vert_source );

	GLuint f_id = glCreateShader( GL_FRAGMENT_SHADER );
	loadAttachShader( sh_prog_id, f_id, frag_source );

	const GLuint built = linkOrFail( sh_prog_id );
	s_progBuildMs += nowMs() - t0;
	return progStore( key, built );
}



// Attach one OPTIONAL stage.  Returns 1 = attached, 0 = file absent (fine),
// -1 = present but failed to compile (the caller must abandon the program).
/**
 * @brief Compiles and attaches one optional pipeline stage (tess control/eval or geometry) to a program, if its source file exists.
 *
 * Unlike loadAttachShader(), a missing file here is a normal "this scene doesn't use the stage"
 * outcome, not a fatal error — only an existing-but-broken file is treated as a failure.
 * @param prog The GL program to attach the stage to.
 * @param type The shader stage type (e.g. GL_TESS_CONTROL_SHADER, GL_GEOMETRY_SHADER).
 * @param file Path to the stage's source file, or NULL to skip it outright.
 * @return 1 if the stage was compiled and attached; 0 if @p file is NULL or does not exist (stage simply omitted); -1 if the file exists but failed to compile (caller must abandon the whole program).
 */
static int attachOptionalStage( GLuint prog, GLenum type, const char *file )
{
	if( file == NULL )
		return 0;
	GLchar *src = textFileRead( file );
	if( src == NULL )
		return 0;                       // scene simply does not use this stage

	GLuint sh = glCreateShader( type );
	glShaderSource( sh, 1, const_cast<const GLchar**>( &src ), NULL );
	free( src );
	glCompileShader( sh );
	printShaderInfoLog( sh );
	GLint ok = 0;
	glGetShaderiv( sh, GL_COMPILE_STATUS, &ok );
	if( !ok ) { glDeleteShader( sh ); return -1; }
	glAttachShader( prog, sh );
	glDeleteShader( sh );               // stays alive while attached
	return 1;
}

// Full pipeline: vertex + [tess control] + [tess evaluation] + [geometry] +
// fragment.  The optional stages are opt-in by FILE PRESENCE, so adding
// tessellation to a scene means dropping X.tesc/X.tese next to X.vert — no
// engine change, no preset attribute.
GLuint setShadersPipeline( const char *vert_source, const char *tesc_source,
                           const char *tese_source, const char *geom_source,
                           const char *frag_source )
{
	const std::string key = progKey( "PL", vert_source, tesc_source, tese_source,
	                                 geom_source, frag_source );
	if( GLuint hit = progLookup( key ) ) return hit;
	const double t0 = nowMs();

	GLuint prog = glCreateProgram();

	GLuint v = glCreateShader( GL_VERTEX_SHADER );
	loadAttachShader( prog, v, vert_source );

	int rc = 0;
	rc |= ( attachOptionalStage( prog, GL_TESS_CONTROL_SHADER,    tesc_source ) < 0 ) ? 1 : 0;
	rc |= ( attachOptionalStage( prog, GL_TESS_EVALUATION_SHADER, tese_source ) < 0 ) ? 1 : 0;
	rc |= ( attachOptionalStage( prog, GL_GEOMETRY_SHADER,        geom_source ) < 0 ) ? 1 : 0;
	if( rc )
	{
		fprintf( stderr, "Pipeline: optional stage failed for '%s'\n", frag_source );
		glDeleteProgram( prog );
		return 0;
	}

	GLuint f = glCreateShader( GL_FRAGMENT_SHADER );
	loadAttachShader( prog, f, frag_source );

	const GLuint built = linkOrFail( prog );
	s_progBuildMs += nowMs() - t0;
	return progStore( key, built );
}

// GL 4.3 compute program.  Unlike the exit-on-error loaders above this one
// fails SOFT (returns 0): the compute entry points are loaded optionally in
// glcoreInit, so a missing function / file / compile keeps the caller on its
// fragment-shader fallback instead of killing the app.
GLuint setComputeShader( const char *comp_source )
{
	if( glDispatchCompute == NULL )
		return 0;

	GLchar *src = textFileRead( comp_source );
	if( src == NULL )
	{
		fprintf( stderr, "Couldn't load compute shader '%s'!\n", comp_source );
		return 0;
	}
	GLuint cs = glCreateShader( GL_COMPUTE_SHADER );
	glShaderSource( cs, 1, const_cast<const GLchar**>( &src ), NULL );
	free( src );
	glCompileShader( cs );
	printShaderInfoLog( cs );
	GLint ok = 0;
	glGetShaderiv( cs, GL_COMPILE_STATUS, &ok );
	if( !ok )
	{
		glDeleteShader( cs );
		return 0;
	}

	GLuint prog = glCreateProgram();
	glAttachShader( prog, cs );
	glLinkProgram( prog );
	printProgramInfoLog( prog );
	glGetProgramiv( prog, GL_LINK_STATUS, &ok );
	glDeleteShader( cs );
	if( !ok )
	{
		glDeleteProgram( prog );
		return 0;
	}
	return prog;
}


