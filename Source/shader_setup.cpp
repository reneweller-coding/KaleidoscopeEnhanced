/**
 * @file shader_setup.cpp
 * @brief Implementation of shader_setup.h: file-based GLSL source loading, per-stage compile/link diagnostics, and the fragment-only / vertex+fragment / full-pipeline / compute program builders.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>


#include "textfile.h"
#include "shader_setup.h"

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

// A program that fails to LINK (as opposed to a missing FILE, which
// loadAttachShader() already treats as fatal) used to be returned anyway:
// initUniforms() would resolve every uniform to -1 on it, and the first
// glUseProgram() on that non-zero-but-unlinked id is invalid per the GL
// spec, so the driver silently leaves whatever program was PREVIOUSLY bound
// active — the broken scene ends up rendering the last-good scene's shader
// under its own (wrong) audio-reactive parameters, with no diagnostic
// beyond the easily-missed "Linking: FAILED!" log line. Returning 0 instead
// (mirroring setShadersPipeline()'s existing convention below) turns that
// into a clean glUseProgram(0) at draw time -- the broken scene just draws
// nothing, which is what Scene3DShader's pipeline path already does today.
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


