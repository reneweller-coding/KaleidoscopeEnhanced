/**
 * @file shader_setup.h
 * @brief Low-level GLSL shader compile/link helpers shared across the engine: builds fragment-only, vertex+fragment,
 * full-pipeline (with optional tessellation/geometry stages) and compute programs from source files.
 */
#ifndef SHADER_SETUP_H
#define SHADER_SETUP_H

#if defined( __linux__ ) || defined( __APPLE__ )
// glcore.h already selects the platform's GL header and defines APIENTRY,
// the same service it performs for the WIN32 arm below. What stood here was
// <gl.h>/<glut.h> from the GLee-and-GLUT era, before glcore existed: paths
// that resolve on no current system, in a branch that had never been built.
#include "glcore.h"
#elif defined( WIN32 )
#include "glcore.h"
#include <GL/gl.h>
#endif
#include <string>

/**  Builds a "classic" fragment-only effect program: the single shared fullscreen vertex shader plus the given
 * fragment shader.
 *
 * @param vert_source  Unused; kept for signature symmetry with setShadersVF() — the shared fullscreen vertex shader
 *                     is used regardless of what is passed here. (in)
 * @param frag_source  Path to the fragment shader source file. (in)
 *
 * @return
 *   The linked, currently-bound (glUseProgram already called) program id.
 *
 * Used by the ordinary 2D/fullscreen effects, which have no per-scene vertex logic — the same
 * compiled vertex shader (Engine\\Fullscreen.vert) is attached to every one of these programs.
 * Exits the process on a missing shader file (fatal by design: a broken install should fail loud
 * at startup rather than run with a black effect).
 *
 * @sideeffects
 *   Changes s_id, s_progBuildMs.
 **/
GLuint setShaders( const char *vert_source, const char *frag_source );
/**  Background build of a setShaders() program (driver-parallel compile, see shader_setup.cpp).
 *
 * @param frag_source  Path of the fragment shader. (in)
 *
 * @return
 *   False when the driver cannot compile in the background (then nothing changed).
 *
 * Start never blocks; shaderPrebuildPoll() hands finished programs to the program
 * cache, so the later setShaders() call is a cache hit.
 *
 * @sideeffects
 *   Changes s_prebuild.
 **/
bool shaderPrebuildStart( const char *frag_source );
/**  Collects finished background builds; returns how many are still running.
 *
 * @return
 *   The number of builds still running.
 **/
int shaderPrebuildPoll();
/**  True if setShaders() for this file would be a cache hit.
 *
 * @param frag_source  Path of the fragment shader. (in)
 *
 * @return
 *   True if setShaders() for this file would be a cache hit.
 **/
bool shaderPrebuildReady( const char *frag_source );
// Specialised variants (chain labs): the fragment file with `defines` inserted
// after its #version line, built in the background like shaderPrebuildStart().
/**  Starts the variant's background build (no-op if built or building).
 *
 * @param frag_source  The fragment shader file. (in)
 * @param defines      "#define ..." lines inserted after its `#version` line. (in)
 *
 * @return
 *   True if the variant is built, building or failed; false if there is no background compile.
 *
 * False without background compile.
 *
 * @sideeffects
 *   Changes s_prebuild, s_workerPending.
 **/
bool shaderVariantStart( const char *frag_source, const std::string &defines );
/**  The variant's program once built, with a reference taken (release with shaderProgramRelease()); 0 while building.
 *
 * @param frag_source  The fragment shader file. (in)
 * @param defines      The variant's defines (as for the start). (in)
 *
 * @return
 *   The program, or 0 while it is still building.
 *
 * @sideeffects
 *   Changes s_progRefs, s_variantFailed.
 **/
GLuint shaderVariantTake( const char *frag_source, const std::string &defines );
/**  True if the variant's build failed (its log is printed once).
 *
 * @param frag_source  The fragment shader file. (in)
 * @param defines      The variant's defines (as for the start). (in)
 *
 * @return
 *   True if the build failed.
 **/
bool shaderVariantFailed( const char *frag_source, const std::string &defines );
/**  Builds a fullscreen program from fragment TEXT now (blocking; cached by text).
 *
 * @param fragText  The complete fragment shader source. (in)
 *
 * @return
 *   The program, or 0 if it did not compile or link.
 *
 * 0 on failure (logged).
 **/
GLuint shaderBuildFromText( const std::string &fragText );
// Vertex+fragment pair (3D scenes) — actually attaches the vertex shader.
/**  Builds a vertex+fragment program where the vertex shader is actually the caller's own file, not the shared
 * fullscreen one.
 *
 * @param vert_source  Path to the vertex shader source file. (in)
 * @param frag_source  Path to the fragment shader source file. (in)
 *
 * @return
 *   The linked, currently-bound (glUseProgram already called) program id.
 *
 * Used by the real 3D scenes (Scene3DShader), whose vertex shader builds the world-space geometry
 * itself. Exits the process on a missing shader file, same as setShaders().
 *
 * @sideeffects
 *   Changes s_progBuildMs.
 **/
GLuint setShadersVF( const char *vert_source, const char *frag_source );
// Full pipeline.  vert and frag are required; tesc/tese/geom may be NULL, and
// a NAMED file that does not exist is also treated as "stage not present", so
// a scene opts into tessellation or a geometry stage purely by dropping the
// matching file next to its .vert/.frag.  Returns 0 if a stage fails to build.
/**  Builds a full vertex + optional-tessellation + optional-geometry + fragment pipeline program.
 *
 * @param vert_source  Path to the (required) vertex shader source file. (in)
 * @param tesc_source  Path to the tessellation control shader source file, or NULL/nonexistent to omit the stage.
 *                     (in)
 * @param tese_source  Path to the tessellation evaluation shader source file, or NULL/nonexistent to omit the
 *                     stage. (in)
 * @param geom_source  Path to the geometry shader source file, or NULL/nonexistent to omit the stage. (in)
 * @param frag_source  Path to the (required) fragment shader source file. (in)
 *
 * @return
 *   The linked, currently-bound (glUseProgram already called) program id, or 0 if an optional stage's file existed
 *   but failed to compile, or if linking failed.
 *
 * @sideeffects
 *   Changes s_progBuildMs.
 **/
GLuint setShadersPipeline( const char *vert_source, const char *tesc_source,
                           const char *tese_source, const char *geom_source,
                           const char *frag_source );

// ---------------------------------------------------------------------------
// Program cache.
//
// A GL program is a pure function of the source files that go into it -- none
// of the builders above injects anything per caller. So two catalogue entries
// naming the same shader compile to the SAME program, and there is no reason
// to build it twice. 212 of the catalogue's 831 scene entries are exactly
// that: a second (or 29th) use of a shader another entry already compiled,
// almost all of them the 3D-model families, where 24 shaders carry 238 scenes
// that differ only in their model and parameters.
//
// The builders consult the cache themselves, so callers need no change. What
// callers MUST do is release instead of calling glDeleteProgram directly: the
// program they hold may still belong to somebody else.
// ---------------------------------------------------------------------------

/**  Releases one reference to a program; deletes it once nobody holds it.
 *
 * @param prog  Program id, or 0 (ignored). (in)
 *
 * The correct counterpart to every setShaders*() call. A program that never
 * came from the cache is deleted straight away, so this is safe to use
 * unconditionally in place of glDeleteProgram().
 **/
void shaderProgramRelease( GLuint prog );

/**  Development aid: forgets every cached program built from this file.
 *
 * @param bareFileName  File name without directories, e.g. "ShipFlyby.frag". (in)
 *
 * @return
 *   How many cache entries were dropped.
 *
 * Used by the shader hot-reload. The programs themselves stay alive until
 * their current users release them -- the next compile simply builds a fresh
 * one from the changed source rather than being handed the stale program.
 **/
int shaderCacheDrop( const char *bareFileName );

/**  Reports what the cache saved, for the startup log.
 *
 * @param programs  Receives the number of distinct programs built (may be NULL). (out)
 * @param reuses    Receives how many times a build was answered from the cache (may be NULL). (out)
 * @param buildMs   Receives the wall-clock time spent actually compiling and linking, in milliseconds (may be
 *                  NULL). Measured around the GL calls themselves -- NOT around ensureCompiled(), which for a
 *                  3D-model scene also imports the .glb and would put a 200 ms mesh load on the shader's bill.
 *                  (out)
 **/
void shaderCacheStats( int *programs, int *reuses, double *buildMs );
// GL 4.3 compute program.  Returns 0 (no exit) when compute entry points,
// the file, or compile/link are missing — callers keep a fragment fallback.
/**  Builds a GL 4.3 compute-shader program from a single source file.
 *
 * @param comp_source  Path to the compute shader source file. (in)
 *
 * @return
 *   The linked, currently-bound (glUseProgram already called) program id, or 0 if compute entry points aren't
 *   loaded, the file is missing, or compile/link fails — callers are expected to fall back to a non-compute path
 *   rather than treat 0 as fatal.
 **/
GLuint setComputeShader( const char *comp_source );

#endif // SHADER_SETUP_H
