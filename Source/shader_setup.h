#if defined(__linux__)
#define GL_GLEXT_PROTOTYPES
#include <gl.h>
#include <glut.h>
#elif defined(__APPLE__)
#include <OpenGL/gl.h>
#include <GLUT/glut.h>
#elif defined(WIN32)
#include "GLee.h"
#include <GL/gl.h>
#endif

GLuint setShaders( const char *vert_source, const char * frag_source );
void checkShaderExt( void );

