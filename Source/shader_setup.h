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
// Full pipeline.  vert and frag are required; tesc/tese/geom may be NULL, and
// a NAMED file that does not exist is also treated as "stage not present", so
// a scene opts into tessellation or a geometry stage purely by dropping the
// matching file next to its .vert/.frag.  Returns 0 if a stage fails to build.
GLuint setShadersPipeline( const char *vert_source, const char *tesc_source,
                           const char *tese_source, const char *geom_source,
                           const char *frag_source );
// GL 4.3 compute program.  Returns 0 (no exit) when compute entry points,
// the file, or compile/link are missing — callers keep a fragment fallback.
GLuint setComputeShader( const char *comp_source );

