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


GLuint setShaders( const char *vert_source, const char * frag_source )
{
	GLuint s_id, sh_prog_id;

	sh_prog_id = glCreateProgram();

	//s_id = glCreateShader( GL_VERTEX_SHADER );
	//loadAttachShader( sh_prog_id, s_id, vert_source );

	s_id = glCreateShader( GL_FRAGMENT_SHADER );
	loadAttachShader( sh_prog_id, s_id, frag_source );

	glLinkProgram( sh_prog_id );
	printProgramInfoLog( sh_prog_id );

	glUseProgram( sh_prog_id );

	return sh_prog_id;
}



/* check whether or not the shader extension is there -- exit, if not! */

void checkShaderExt( void )
{
    const GLubyte * strVersion = glGetString( GL_VERSION );
    printf("GL version = %s\n", strVersion );
    const GLubyte * extbytes = glGetString( GL_EXTENSIONS );
    char * extstr = strdup( (char*) extbytes );
    char * c = extstr;
    while ( *c )
    {
        if ( *c == ' ' )
            *c = '\n';
        c ++ ;
    }
    fputs("GL extensions: ", stdout);
    puts( extstr );

    ///* Run-time extension check. */
    //if ( !glutExtensionSupported("GL_ARB_vertex_shader") )
    //{
    //    fprintf(stderr, "GL_ARB_vertex_shader not found!\n");
    //    exit(-1);
    //}
}


