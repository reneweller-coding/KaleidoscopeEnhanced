#if defined(__linux__)
#define GL_GLEXT_PROTOTYPES
#include <gl.h>
#include <glut.h>
#elif defined(__APPLE__)
#include <OpenGL/gl.h>
#include <GLUT/glut.h>
#elif defined(WIN32)
#include "glcore.h"
#include <GL/gl.h>
#endif

GLuint setShaders( const char *vert_source, const char * frag_source );
// Vertex+fragment pair (3D scenes) — actually attaches the vertex shader.
GLuint setShadersVF( const char *vert_source, const char *frag_source );
// GL 4.3 compute program.  Returns 0 (no exit) when compute entry points,
// the file, or compile/link are missing — callers keep a fragment fallback.
GLuint setComputeShader( const char *comp_source );

