// glcore.h — self-contained OpenGL core loader (replaces GLee).
// ---------------------------------------------------------------------------
// Windows' <GL/gl.h> only exports GL 1.1; every newer entry point must be
// resolved at runtime.  GLee did that for the compatibility era but chokes on
// a CORE context (it reads the removed GL_EXTENSIONS string) and predates
// GL 4.3 compute.  This header declares exactly what THIS codebase uses:
// the call sites keep their standard names via #define remaps onto loaded
// pointers.  Call glcoreInit() once with the context current (initializeGL).
//
// MUST be included before any other gl.h path (same rule as GLee before it).
/**
 * @file glcore.h
 * @brief Hand-rolled OpenGL 4.3 core-profile function-pointer loader that replaces
 *        GLEW/GLee.
 *
 * @par The problem this solves
 * On Windows, `<GL/gl.h>` only exports the fixed-function GL 1.1 API; every entry
 * point added since then (buffers, shaders, framebuffers, compute, ...) must be
 * resolved at runtime via wglGetProcAddress. The codebase used to rely on GLee for
 * that, but GLee predates GL 4.3 compute shaders and actively breaks on a CORE
 * profile context: it probes the (compatibility-only) `GL_EXTENSIONS` string, which
 * a core context no longer exposes. Since a core profile also has no fixed-function
 * pipeline (no glBegin/glEnd, no matrix stack, everything goes through shaders and
 * buffers), this loader only ever needs to resolve the "modern" entry points this
 * codebase actually calls.
 *
 * @par How it works
 * This header declares exactly the GL entry points the codebase uses as function
 * pointers named `glcore_<name>` (via the GLC_FN macro), plus the GL tokens/typedefs
 * missing from the GL 1.1 headers. `#define`s then remap the standard GL call-site
 * names (e.g. `glActiveTexture`) onto the loaded pointers (`glcore_glActiveTexture`),
 * so callers elsewhere in the codebase keep writing ordinary-looking GL calls.
 * glcoreInit() (see glcore.cpp) resolves every pointer once, with a GL context
 * current (called from initializeGL); glcoreHasCompute / glcoreHasTess then report
 * whether the optional compute/tessellation entry points were actually available, so
 * callers can gate those code paths and fall back gracefully.
 *
 * This header must be included before any other path that pulls in `<GL/gl.h>`,
 * the same rule that applied to GLee before it.
 */

#pragma once

#ifdef _WIN32
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
// Without this, <windows.h> defines min/max as MACROS and every later
// std::min( a, b ) fails with a bewildering "invalid token on the right of ::".
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include <GL/gl.h>
#else
// POSIX: no windows.h, and the GL 1.1 prototypes live elsewhere. APIENTRY is
// the calling convention every GLC_FN below is declared with; on Windows it
// comes from windef.h, on POSIX the ABI has only one convention, so it is
// simply empty.
#if defined(__APPLE__)
#include <OpenGL/gl.h>
#else
#include <GL/gl.h>
#endif
#ifndef APIENTRY
#define APIENTRY
#endif
// <windows.h> pulled in ptrdiff_t/size_t as a side effect; ask directly.
#include <cstddef>
using std::ptrdiff_t;
using std::size_t;
#endif // _WIN32

// ---- Types missing from GL 1.1 headers ----
/// @name Types missing from the GL 1.1 headers, needed by the shader/buffer API below.
///@{
typedef char      GLchar;
typedef ptrdiff_t GLsizeiptr;
typedef ptrdiff_t GLintptr;
///@}

// ---- Tokens beyond GL 1.1 (only what the codebase touches) ----
/// @name GL enum/token values beyond GL 1.1.
/// Hard-coded because the GL 1.1 headers don't declare them; values are only the
/// ones this codebase actually passes to GL calls (texture wrap/compare modes,
/// texture units, buffer targets/usage hints, shader stages, framebuffer/renderbuffer
/// enums and status codes, texture internal/pixel formats, and memory-barrier bits).
///@{
#define GL_CLAMP_TO_EDGE                  0x812F
#define GL_TEXTURE_BINDING_2D             0x8069
// Shadow-map sampling.  With COMPARE_REF_TO_TEXTURE the sampler returns the
// RESULT of a depth comparison, so a LINEAR filter averages four booleans and
// gives 2x2 percentage-closer filtering for free.
#define GL_CLAMP_TO_BORDER                0x812D
#define GL_TEXTURE_COMPARE_MODE           0x884C
#define GL_TEXTURE_COMPARE_FUNC           0x884D
#define GL_COMPARE_REF_TO_TEXTURE         0x884E
#define GL_TEXTURE_WRAP_R                 0x8072
#define GL_BGRA                           0x80E1
#define GL_MULTISAMPLE                    0x809D
// Frame-History-Ring (PresentPass): Array-Textur + FBO-Blit.
#define GL_TEXTURE_2D_ARRAY               0x8C1A
#define GL_READ_FRAMEBUFFER               0x8CA8
#define GL_DRAW_FRAMEBUFFER               0x8CA9

#define GL_TEXTURE0                       0x84C0
#define GL_TEXTURE1                       0x84C1
#define GL_TEXTURE2                       0x84C2
#define GL_TEXTURE3                       0x84C3
#define GL_TEXTURE4                       0x84C4
#define GL_TEXTURE5                       0x84C5
#define GL_TEXTURE6                       0x84C6
#define GL_TEXTURE7                       0x84C7
#define GL_TEXTURE8                       0x84C8
#define GL_TEXTURE9                       0x84C9
#define GL_TEXTURE10                      0x84CA
#define GL_TEXTURE11                      0x84CB
#define GL_TEXTURE12                      0x84CC
// ComputeFX publishes on 12..27; 28 upward is for host-uploaded data textures.
#define GL_TEXTURE28                      0x84DC

#define GL_ARRAY_BUFFER                   0x8892
#define GL_ELEMENT_ARRAY_BUFFER           0x8893
#define GL_PIXEL_UNPACK_BUFFER            0x88EC
#define GL_PIXEL_PACK_BUFFER              0x88EB
#define GL_SHADER_STORAGE_BUFFER          0x90D2
#define GL_DISPATCH_INDIRECT_BUFFER       0x90EE
#define GL_DRAW_INDIRECT_BUFFER           0x8F3F
#define GL_STATIC_DRAW                    0x88E4
#define GL_DYNAMIC_DRAW                   0x88E8
#define GL_STREAM_DRAW                    0x88E0
#define GL_STATIC_COPY                    0x88E6
#define GL_DYNAMIC_COPY                   0x88EA
#define GL_WRITE_ONLY                     0x88B9
#define GL_READ_ONLY                      0x88B8
#define GL_READ_WRITE                     0x88BA

#define GL_FRAGMENT_SHADER                0x8B30
#define GL_VERTEX_SHADER                  0x8B31
#define GL_COMPUTE_SHADER                 0x91B9
// KHR_debug (core since 4.3). The driver names the offending call and often
// the reason, which a glGetError() checkpoint cannot: the checkpoint only
// reports where the error was NOTICED, several subsystems downstream.
#define GL_DEBUG_OUTPUT                   0x92E0
#define GL_DEBUG_OUTPUT_SYNCHRONOUS       0x8242
#define GL_DEBUG_SEVERITY_HIGH            0x9146
#define GL_DEBUG_SEVERITY_MEDIUM          0x9147
#define GL_DEBUG_SEVERITY_LOW             0x9148
#define GL_DEBUG_SEVERITY_NOTIFICATION    0x826B
#define GL_DEBUG_TYPE_ERROR               0x824C
#define GL_GEOMETRY_SHADER                0x8DD9
#define GL_TESS_EVALUATION_SHADER         0x8E87
#define GL_TESS_CONTROL_SHADER            0x8E88
#define GL_PATCHES                        0x000E
#define GL_PATCH_VERTICES                 0x8E72
#define GL_MAX_PATCH_VERTICES             0x8E7D
#define GL_MAX_TESS_GEN_LEVEL             0x8E7E
#define GL_COMPILE_STATUS                 0x8B81
#define GL_LINK_STATUS                    0x8B82
#define GL_INFO_LOG_LENGTH                0x8B84

#define GL_FRAMEBUFFER                    0x8D40
#define GL_RENDERBUFFER                   0x8D41
#define GL_COLOR_ATTACHMENT0              0x8CE0
#define GL_COLOR_ATTACHMENT1              0x8CE1
#define GL_DEPTH_ATTACHMENT               0x8D00
#define GL_DEPTH_COMPONENT24              0x81A6
#define GL_FRAMEBUFFER_COMPLETE           0x8CD5
#define GL_FRAMEBUFFER_INCOMPLETE_ATTACHMENT          0x8CD6
#define GL_FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT  0x8CD7
#define GL_FRAMEBUFFER_INCOMPLETE_DIMENSIONS          0x8CD9
#define GL_FRAMEBUFFER_INCOMPLETE_FORMATS             0x8CDA
#define GL_FRAMEBUFFER_INCOMPLETE_DRAW_BUFFER         0x8CDB
#define GL_FRAMEBUFFER_INCOMPLETE_READ_BUFFER         0x8CDC
#define GL_FRAMEBUFFER_UNSUPPORTED                    0x8CDD
#define GL_INVALID_FRAMEBUFFER_OPERATION              0x0506

#define GL_RGBA16F                        0x881A
#define GL_RGBA32F                        0x8814
#define GL_R8                             0x8229
#define GL_R16F                           0x822D
#define GL_R32F                           0x822E
#define GL_RG                             0x8227
#define GL_RG16F                          0x822F
#define GL_RG32F                          0x8230
#define GL_R32UI                          0x8236
#define GL_RED_INTEGER                    0x8D94
#define GL_MAX_TEXTURE_IMAGE_UNITS        0x8872
// NOTE the difference, it matters for the shadow/prev-frame/Mandelbrot units:
// GL_MAX_TEXTURE_IMAGE_UNITS caps how many samplers ONE fragment stage may use,
// while GL_MAX_COMBINED_TEXTURE_IMAGE_UNITS is what bounds the legal UNIT INDEX
// for glActiveTexture() and for a sampler's glUniform1i() value. They are very
// different numbers (32 vs 192 on this machine), so a unit index above the
// former is not automatically invalid.
#define GL_MAX_COMBINED_TEXTURE_IMAGE_UNITS 0x8B4D
#define GL_MAX_COMPUTE_WORK_GROUP_INVOCATIONS 0x90EB

#define GL_PROGRAM_POINT_SIZE             0x8642
#define GL_NUM_EXTENSIONS                 0x821D
#define GL_CURRENT_PROGRAM                0x8B8D

#define GL_SHADER_IMAGE_ACCESS_BARRIER_BIT 0x00000020
#define GL_TEXTURE_FETCH_BARRIER_BIT       0x00000008
#define GL_FRAMEBUFFER_BARRIER_BIT         0x00000400
#define GL_SHADER_STORAGE_BARRIER_BIT      0x00002000
#define GL_VERTEX_ATTRIB_ARRAY_BARRIER_BIT 0x00000001
#define GL_COMMAND_BARRIER_BIT             0x00000040
#define GL_ALL_BARRIER_BITS                0xFFFFFFFF
///@}

// ---- Function pointers (loaded in glcoreInit) ----
#ifdef __cplusplus
extern "C" {
#endif

/**
 * @brief Declares one loadable GL entry point.
 *
 * For entry point @p name, defines its function-pointer typedef `PFN_<name>` (with
 * signature `ret args`) and declares the global pointer variable `glcore_<name>` that
 * glcoreInit() (see glcore.cpp) resolves via wglGetProcAddress/GetProcAddress. Used
 * only for the duration of the declaration list below; undef'd immediately after.
 * @param ret Return type of the GL function.
 * @param name Name of the GL function (e.g. glActiveTexture).
 * @param args Parenthesized parameter-type list of the GL function.
 */
#define GLC_FN(ret, name, args) \
    typedef ret (APIENTRY *PFN_##name) args; \
    extern PFN_##name glcore_##name;

/// @name Loadable GL entry points, grouped by area.
/// Buffers/VAOs (glGenBuffers..glVertexAttribPointer/glGetAttribLocation), shader and
/// program objects (glCreateShader..glGetUniformLocation, glUniform*), framebuffers
/// and renderbuffers (glGenFramebuffers..glGenerateMipmap), GL 4.3 compute (
/// glDispatchCompute, glBindImageTexture, glMemoryBarrier, glBindBufferBase,
/// glClearBufferData, glDrawArraysIndirect, glDispatchComputeIndirect),
/// tessellation (glPatchParameteri), order-independent-transparency blending
/// (glBlendFunci, glDrawBuffers, glClearBufferfv), and the Frame-History-Ring
/// texture-array/blit path (glTexImage3D, glFramebufferTextureLayer,
/// glBlitFramebuffer). See glcoreInit() in glcore.cpp for which of these are
/// mandatory vs. optional.
///@{
GLC_FN(void,   glActiveTexture, (GLenum))
GLC_FN(void,   glGenBuffers, (GLsizei, GLuint*))
GLC_FN(void,   glBindBuffer, (GLenum, GLuint))
GLC_FN(void,   glBufferData, (GLenum, GLsizeiptr, const void*, GLenum))
GLC_FN(void,   glBufferSubData, (GLenum, GLintptr, GLsizeiptr, const void*))
GLC_FN(void,   glDeleteBuffers, (GLsizei, const GLuint*))
GLC_FN(void*,  glMapBuffer, (GLenum, GLenum))
GLC_FN(GLboolean, glUnmapBuffer, (GLenum))
GLC_FN(void,   glGenVertexArrays, (GLsizei, GLuint*))
GLC_FN(void,   glBindVertexArray, (GLuint))
GLC_FN(void,   glDeleteVertexArrays, (GLsizei, const GLuint*))
GLC_FN(void,   glEnableVertexAttribArray, (GLuint))
GLC_FN(void,   glDisableVertexAttribArray, (GLuint))
GLC_FN(void,   glVertexAttribPointer, (GLuint, GLint, GLenum, GLboolean, GLsizei, const void*))
GLC_FN(GLint,  glGetAttribLocation, (GLuint, const GLchar*))
GLC_FN(GLuint, glCreateShader, (GLenum))
GLC_FN(void,   glDeleteShader, (GLuint))
GLC_FN(void,   glShaderSource, (GLuint, GLsizei, const GLchar* const*, const GLint*))
GLC_FN(void,   glCompileShader, (GLuint))
GLC_FN(void,   glGetShaderiv, (GLuint, GLenum, GLint*))
GLC_FN(void,   glGetShaderInfoLog, (GLuint, GLsizei, GLsizei*, GLchar*))
GLC_FN(GLuint, glCreateProgram, (void))
GLC_FN(void,   glDeleteProgram, (GLuint))
GLC_FN(void,   glAttachShader, (GLuint, GLuint))
GLC_FN(void,   glDetachShader, (GLuint, GLuint))
GLC_FN(void,   glLinkProgram, (GLuint))
GLC_FN(void,   glGetProgramiv, (GLuint, GLenum, GLint*))
GLC_FN(void,   glGetProgramInfoLog, (GLuint, GLsizei, GLsizei*, GLchar*))
GLC_FN(void,   glUseProgram, (GLuint))
GLC_FN(GLint,  glGetUniformLocation, (GLuint, const GLchar*))
GLC_FN(void,   glUniform1i, (GLint, GLint))
GLC_FN(void,   glUniform2i, (GLint, GLint, GLint))
GLC_FN(void,   glUniform1ui, (GLint, GLuint))
GLC_FN(void,   glUniform1f, (GLint, GLfloat))
GLC_FN(void,   glUniform2f, (GLint, GLfloat, GLfloat))
GLC_FN(void,   glUniform3f, (GLint, GLfloat, GLfloat, GLfloat))
GLC_FN(void,   glUniform4f, (GLint, GLfloat, GLfloat, GLfloat, GLfloat))
GLC_FN(void,   glUniform1fv, (GLint, GLsizei, const GLfloat*))
GLC_FN(void,   glUniform1iv, (GLint, GLsizei, const GLint*))
GLC_FN(void,   glUniform2fv, (GLint, GLsizei, const GLfloat*))
GLC_FN(void,   glUniform3fv, (GLint, GLsizei, const GLfloat*))
GLC_FN(void,   glUniformMatrix4fv, (GLint, GLsizei, GLboolean, const GLfloat*))
GLC_FN(void,   glGenFramebuffers, (GLsizei, GLuint*))
GLC_FN(void,   glBindFramebuffer, (GLenum, GLuint))
GLC_FN(void,   glDeleteFramebuffers, (GLsizei, const GLuint*))
GLC_FN(void,   glFramebufferTexture2D, (GLenum, GLenum, GLenum, GLuint, GLint))
GLC_FN(GLenum, glCheckFramebufferStatus, (GLenum))
GLC_FN(void,   glGenRenderbuffers, (GLsizei, GLuint*))
GLC_FN(void,   glBindRenderbuffer, (GLenum, GLuint))
GLC_FN(void,   glDeleteRenderbuffers, (GLsizei, const GLuint*))
GLC_FN(void,   glRenderbufferStorage, (GLenum, GLenum, GLsizei, GLsizei))
GLC_FN(void,   glFramebufferRenderbuffer, (GLenum, GLenum, GLenum, GLuint))
GLC_FN(void,   glGenerateMipmap, (GLenum))
GLC_FN(const GLubyte*, glGetStringi, (GLenum, GLuint))
typedef void (APIENTRY *GLDEBUGPROCKC)( GLenum source, GLenum type, GLuint id,
                                        GLenum severity, GLsizei length,
                                        const GLchar *message, const void *userParam );
GLC_FN(void,   glDebugMessageCallback, (GLDEBUGPROCKC, const void *))
GLC_FN(void,   glDebugMessageControl, (GLenum, GLenum, GLenum, GLsizei, const GLuint *, GLboolean))
GLC_FN(void,   glDispatchCompute, (GLuint, GLuint, GLuint))
GLC_FN(void,   glDispatchComputeIndirect, (GLintptr))
GLC_FN(void,   glBindImageTexture, (GLuint, GLuint, GLint, GLboolean, GLint, GLenum, GLenum))
GLC_FN(void,   glMemoryBarrier, (GLbitfield))
GLC_FN(void,   glBindBufferBase, (GLenum, GLuint, GLuint))
GLC_FN(void,   glClearBufferData, (GLenum, GLenum, GLenum, GLenum, const void*))
GLC_FN(void,   glDrawArraysIndirect, (GLenum, const void*))
// Core since GL 3.1. Needed so one loaded mesh can be drawn as a whole
// formation from a single buffer (Fleet), instead of uploading N copies.
GLC_FN(void,   glDrawArraysInstanced, (GLenum, GLint, GLsizei, GLsizei))
GLC_FN(void,   glPatchParameteri, (GLenum, GLint))
// Order-independent transparency needs its two targets blended DIFFERENTLY in
// the same draw — accumulation adds, revealage multiplies — which is exactly
// what the indexed blend entry points are for.
GLC_FN(void,   glBlendFunci, (GLuint, GLenum, GLenum))
GLC_FN(void,   glDrawBuffers, (GLsizei, const GLenum *))
GLC_FN(void,   glClearBufferfv, (GLenum, GLint, const GLfloat *))
// Frame-History-Ring: 2D-Array-Textur als Ringpuffer der letzten Sekunden,
// gefuellt per FBO-zu-Layer-Blit (Downscale inklusive).
GLC_FN(void,   glTexImage3D, (GLenum, GLint, GLint, GLsizei, GLsizei, GLsizei, GLint, GLenum, GLenum, const void*))
GLC_FN(void,   glFramebufferTextureLayer, (GLenum, GLenum, GLuint, GLint, GLint))
GLC_FN(void,   glBlitFramebuffer, (GLint, GLint, GLint, GLint, GLint, GLint, GLint, GLint, GLbitfield, GLenum))
// MSAA for the opaque 3D geometry pass: render into a multisample texture,
// resolve (blit) down to the regular render targets before anything
// downstream (combine, depth-based post) ever samples them.
GLC_FN(void,   glTexImage2DMultisample, (GLenum, GLsizei, GLenum, GLsizei, GLsizei, GLboolean))
///@}

#undef GLC_FN

// Call-site remaps: the code keeps using the standard names.
/// @name Call-site remaps.
/// Redefines each standard GL function name to the corresponding loaded pointer
/// (`glcore_<name>`), so the rest of the codebase can keep calling e.g.
/// `glActiveTexture(...)` unmodified instead of `glcore_glActiveTexture(...)`.
///@{
#define glActiveTexture            glcore_glActiveTexture
#define glGenBuffers               glcore_glGenBuffers
#define glBindBuffer               glcore_glBindBuffer
#define glBufferData               glcore_glBufferData
#define glBufferSubData            glcore_glBufferSubData
#define glDeleteBuffers            glcore_glDeleteBuffers
#define glMapBuffer                glcore_glMapBuffer
#define glUnmapBuffer              glcore_glUnmapBuffer
#define glGenVertexArrays          glcore_glGenVertexArrays
#define glBindVertexArray          glcore_glBindVertexArray
#define glDeleteVertexArrays       glcore_glDeleteVertexArrays
#define glEnableVertexAttribArray  glcore_glEnableVertexAttribArray
#define glDisableVertexAttribArray glcore_glDisableVertexAttribArray
#define glVertexAttribPointer      glcore_glVertexAttribPointer
#define glGetAttribLocation        glcore_glGetAttribLocation
#define glCreateShader             glcore_glCreateShader
#define glDeleteShader             glcore_glDeleteShader
#define glShaderSource             glcore_glShaderSource
#define glCompileShader            glcore_glCompileShader
#define glGetShaderiv              glcore_glGetShaderiv
#define glGetShaderInfoLog         glcore_glGetShaderInfoLog
#define glCreateProgram            glcore_glCreateProgram
#define glDeleteProgram            glcore_glDeleteProgram
#define glAttachShader             glcore_glAttachShader
#define glDetachShader             glcore_glDetachShader
#define glLinkProgram              glcore_glLinkProgram
#define glGetProgramiv             glcore_glGetProgramiv
#define glGetProgramInfoLog        glcore_glGetProgramInfoLog
#define glUseProgram               glcore_glUseProgram
#define glGetUniformLocation       glcore_glGetUniformLocation
#define glUniform1i                glcore_glUniform1i
#define glUniform2i                glcore_glUniform2i
#define glUniform1ui               glcore_glUniform1ui
#define glUniform1f                glcore_glUniform1f
#define glUniform2f                glcore_glUniform2f
#define glUniform3f                glcore_glUniform3f
#define glUniform4f                glcore_glUniform4f
#define glUniform1fv               glcore_glUniform1fv
#define glUniform1iv               glcore_glUniform1iv
#define glUniform2fv               glcore_glUniform2fv
#define glUniform3fv               glcore_glUniform3fv
#define glUniformMatrix4fv         glcore_glUniformMatrix4fv
#define glGenFramebuffers          glcore_glGenFramebuffers
#define glBindFramebuffer          glcore_glBindFramebuffer
#define glDeleteFramebuffers       glcore_glDeleteFramebuffers
#define glFramebufferTexture2D     glcore_glFramebufferTexture2D
#define glCheckFramebufferStatus   glcore_glCheckFramebufferStatus
#define glGenRenderbuffers         glcore_glGenRenderbuffers
#define glBindRenderbuffer         glcore_glBindRenderbuffer
#define glDeleteRenderbuffers      glcore_glDeleteRenderbuffers
#define glRenderbufferStorage      glcore_glRenderbufferStorage
#define glFramebufferRenderbuffer  glcore_glFramebufferRenderbuffer
#define glGenerateMipmap           glcore_glGenerateMipmap
#define glGetStringi               glcore_glGetStringi
#define glDebugMessageCallback     glcore_glDebugMessageCallback
#define glDebugMessageControl      glcore_glDebugMessageControl
#define glDispatchCompute          glcore_glDispatchCompute
#define glDispatchComputeIndirect  glcore_glDispatchComputeIndirect
#define glBindImageTexture         glcore_glBindImageTexture
#define glMemoryBarrier            glcore_glMemoryBarrier
#define glBindBufferBase           glcore_glBindBufferBase
#define glClearBufferData          glcore_glClearBufferData
#define glDrawArraysIndirect       glcore_glDrawArraysIndirect
#define glDrawArraysInstanced      glcore_glDrawArraysInstanced
#define glPatchParameteri          glcore_glPatchParameteri
#define glBlendFunci               glcore_glBlendFunci
#define glDrawBuffers              glcore_glDrawBuffers
#define glClearBufferfv            glcore_glClearBufferfv
#define glTexImage3D               glcore_glTexImage3D
#define glFramebufferTextureLayer  glcore_glFramebufferTextureLayer
#define glBlitFramebuffer          glcore_glBlitFramebuffer
#define glTexImage2DMultisample    glcore_glTexImage2DMultisample
///@}

/**
 * @brief True when every entry point the compute pipeline needs resolved (set by
 *        glcoreInit()). Callers gate their compute path on this and keep a fallback.
 */
extern int glcoreHasCompute;
/**
 * @brief True when tessellation is usable (glPatchParameteri resolved). Geometry
 *        shaders need no extra entry point, so they ride on the core 3.2 context.
 */
extern int glcoreHasTess;

/// Non-zero once KHR_debug's entry points resolved (core since GL 4.3).
extern int glcoreHasDebug;

/// @brief Installs a debug callback that logs GL errors with the API call that
///        raised them. Called by the engine only when KALEIDO_GL_DEBUG is set.
void glcoreEnableDebugOutput();

/// @brief Records which shader file a program was built from, so the debug
///        callback can name it. No-op cost when debug output is off.
void glcoreNameProgram( unsigned prog, const char *name );
/// @brief Name recorded for @p prog, or "?" if none.
const char *glcoreDebugProgramName( unsigned prog );
/// @brief Names the pipeline STATION for the debug callback ("scene:act",
///        "shadowPass1", ...). The program name says which shader; this says
///        which of the several draws of that shader per frame. Pass a string
///        literal -- only the pointer is stored.
void glcoreDebugMark( const char *station );

// ---------------------------------------------------------------------------
// Stand-in textures.
//
// A draw is validated against EVERY sampler the bound program declares, not
// only the ones its branches actually reach. So a shader that declares an
// optional sampler -- a model's material layers, a frame-history ring, a
// shadow map -- makes the whole draw ill-formed whenever that unit is left
// empty, even though nothing samples it. The driver calls this out as
// 'texture object (0) ... does not have a defined base level'.
//
// Binding a complete 1x1 texture of the right TYPE costs nothing and makes
// the state well-defined. One instance per type, created on first use and
// owned by glcore for the life of the context.
// ---------------------------------------------------------------------------

/// @brief 1x1 opaque-black GL_TEXTURE_2D. @return Texture name.
GLuint glcoreDummyTex2D();
/// @brief 1x1x1 opaque-black GL_TEXTURE_2D_ARRAY. @return Texture name (0 if glTexImage3D is missing).
GLuint glcoreDummyTex2DArray();
/// @brief 1x1 depth texture, COMPARE_REF_TO_TEXTURE, depth 1.0 -- reads as
///        'nothing occludes', so a shadow sampler bound to it renders fully lit.
/// @return Texture name.
GLuint glcoreDummyShadow();

/**
 * @brief Resolves every GL function pointer declared above.
 *
 * Must be called once with a GL context current (e.g. from initializeGL), before any
 * of the remapped GL calls are used. Required entry points that fail to resolve are
 * logged by name; optional (compute/tessellation/frame-history) ones are logged but
 * don't fail the call. Also sets glcoreHasCompute / glcoreHasTess based on which
 * optional pointers resolved.
 * @return Non-zero (true) if every required (non-optional) entry point resolved,
 *         zero if any is missing.
 */
int glcoreInit(void);

#ifdef __cplusplus
}
#endif
