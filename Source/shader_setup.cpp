#include <stdio.h>
#include <stdlib.h>
#include <string.h>


#include "textfile.h"
#include "shader_setup.h"

// Opengl feedback about shaders

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

GLuint setShaders( const char *vert_source, const char * frag_source )
{
	GLuint s_id, sh_prog_id;
	(void)vert_source;   // historical parameter; the shared fullscreen vert rules

	sh_prog_id = glCreateProgram();

	glAttachShader( sh_prog_id, fullscreenVertShader() );

	s_id = glCreateShader( GL_FRAGMENT_SHADER );
	loadAttachShader( sh_prog_id, s_id, frag_source );

	glLinkProgram( sh_prog_id );
	printProgramInfoLog( sh_prog_id );

	glUseProgram( sh_prog_id );

	return sh_prog_id;
}

// Vertex + fragment pair (the REAL 3D scene effects): unlike setShaders()
// above, this one actually attaches the vertex shader.
GLuint setShadersVF( const char *vert_source, const char *frag_source )
{
	GLuint sh_prog_id = glCreateProgram();

	GLuint v_id = glCreateShader( GL_VERTEX_SHADER );
	loadAttachShader( sh_prog_id, v_id, vert_source );

	GLuint f_id = glCreateShader( GL_FRAGMENT_SHADER );
	loadAttachShader( sh_prog_id, f_id, frag_source );

	glLinkProgram( sh_prog_id );
	printProgramInfoLog( sh_prog_id );

	glUseProgram( sh_prog_id );

	return sh_prog_id;
}



// Attach one OPTIONAL stage.  Returns 1 = attached, 0 = file absent (fine),
// -1 = present but failed to compile (the caller must abandon the program).
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

	glLinkProgram( prog );
	printProgramInfoLog( prog );
	GLint linked = 0;
	glGetProgramiv( prog, GL_LINK_STATUS, &linked );
	if( !linked ) { glDeleteProgram( prog ); return 0; }

	glUseProgram( prog );
	return prog;
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


