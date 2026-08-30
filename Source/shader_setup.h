/**
 * @file shader_setup.h
 * @brief Low-level GLSL shader compile/link helpers shared across the engine: builds fragment-only, vertex+fragment, full-pipeline (with optional tessellation/geometry stages) and compute programs from source files.
 */
#if defined(__linux__) || defined(__APPLE__)
// glcore.h already selects the platform's GL header and defines APIENTRY,
// the same service it performs for the WIN32 arm below. What stood here was
// <gl.h>/<glut.h> from the GLee-and-GLUT era, before glcore existed: paths
// that resolve on no current system, in a branch that had never been built.
#include "glcore.h"
#elif defined(WIN32)
#include "glcore.h"
#include <GL/gl.h>
#endif

/**
 * @brief Builds a "classic" fragment-only effect program: the single shared fullscreen vertex shader plus the given fragment shader.
 *
 * Used by the ordinary 2D/fullscreen effects, which have no per-scene vertex logic — the same
 * compiled vertex shader (Engine\\Fullscreen.vert) is attached to every one of these programs.
 * Exits the process on a missing shader file (fatal by design: a broken install should fail loud
 * at startup rather than run with a black effect).
 * @param vert_source Unused; kept for signature symmetry with setShadersVF() — the shared fullscreen vertex shader is used regardless of what is passed here.
 * @param frag_source Path to the fragment shader source file.
 * @return The linked, currently-bound (glUseProgram already called) program id.
 */
GLuint setShaders( const char *vert_source, const char * frag_source );
// Vertex+fragment pair (3D scenes) — actually attaches the vertex shader.
/**
 * @brief Builds a vertex+fragment program where the vertex shader is actually the caller's own file, not the shared fullscreen one.
 *
 * Used by the real 3D scenes (Scene3DShader), whose vertex shader builds the world-space geometry
 * itself. Exits the process on a missing shader file, same as setShaders().
 * @param vert_source Path to the vertex shader source file.
 * @param frag_source Path to the fragment shader source file.
 * @return The linked, currently-bound (glUseProgram already called) program id.
 */
GLuint setShadersVF( const char *vert_source, const char *frag_source );
// Full pipeline.  vert and frag are required; tesc/tese/geom may be NULL, and
// a NAMED file that does not exist is also treated as "stage not present", so
// a scene opts into tessellation or a geometry stage purely by dropping the
// matching file next to its .vert/.frag.  Returns 0 if a stage fails to build.
/**
 * @brief Builds a full vertex + optional-tessellation + optional-geometry + fragment pipeline program.
 * @param vert_source Path to the (required) vertex shader source file.
 * @param tesc_source Path to the tessellation control shader source file, or NULL/nonexistent to omit the stage.
 * @param tese_source Path to the tessellation evaluation shader source file, or NULL/nonexistent to omit the stage.
 * @param geom_source Path to the geometry shader source file, or NULL/nonexistent to omit the stage.
 * @param frag_source Path to the (required) fragment shader source file.
 * @return The linked, currently-bound (glUseProgram already called) program id, or 0 if an optional stage's file existed but failed to compile, or if linking failed.
 */
GLuint setShadersPipeline( const char *vert_source, const char *tesc_source,
                           const char *tese_source, const char *geom_source,
                           const char *frag_source );
// GL 4.3 compute program.  Returns 0 (no exit) when compute entry points,
// the file, or compile/link are missing — callers keep a fragment fallback.
/**
 * @brief Builds a GL 4.3 compute-shader program from a single source file.
 * @param comp_source Path to the compute shader source file.
 * @return The linked, currently-bound (glUseProgram already called) program id, or 0 if compute entry points aren't loaded, the file is missing, or compile/link fails — callers are expected to fall back to a non-compute path rather than treat 0 as fatal.
 */
GLuint setComputeShader( const char *comp_source );

