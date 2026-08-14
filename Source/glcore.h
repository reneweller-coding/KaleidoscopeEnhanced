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

#pragma once

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

// ---- Types missing from GL 1.1 headers ----
#include <stddef.h>
typedef char      GLchar;
typedef ptrdiff_t GLsizeiptr;
typedef ptrdiff_t GLintptr;

// ---- Tokens beyond GL 1.1 (only what the codebase touches) ----
#define GL_CLAMP_TO_EDGE                  0x812F
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

// ---- Function pointers (loaded in glcoreInit) ----
#ifdef __cplusplus
extern "C" {
#endif

#define GLC_FN(ret, name, args) \
    typedef ret (APIENTRY *PFN_##name) args; \
    extern PFN_##name glcore_##name;

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
GLC_FN(void,   glDispatchCompute, (GLuint, GLuint, GLuint))
GLC_FN(void,   glDispatchComputeIndirect, (GLintptr))
GLC_FN(void,   glBindImageTexture, (GLuint, GLuint, GLint, GLboolean, GLint, GLenum, GLenum))
GLC_FN(void,   glMemoryBarrier, (GLbitfield))
GLC_FN(void,   glBindBufferBase, (GLenum, GLuint, GLuint))
GLC_FN(void,   glClearBufferData, (GLenum, GLenum, GLenum, GLenum, const void*))
GLC_FN(void,   glDrawArraysIndirect, (GLenum, const void*))
GLC_FN(void,   glPatchParameteri, (GLenum, GLint))

#undef GLC_FN

// Call-site remaps: the code keeps using the standard names.
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
#define glDispatchCompute          glcore_glDispatchCompute
#define glDispatchComputeIndirect  glcore_glDispatchComputeIndirect
#define glBindImageTexture         glcore_glBindImageTexture
#define glMemoryBarrier            glcore_glMemoryBarrier
#define glBindBufferBase           glcore_glBindBufferBase
#define glClearBufferData          glcore_glClearBufferData
#define glDrawArraysIndirect       glcore_glDrawArraysIndirect
#define glPatchParameteri          glcore_glPatchParameteri

// True when every entry point the compute pipeline needs resolved (set by
// glcoreInit).  Callers gate their compute path on this and keep a fallback.
extern int glcoreHasCompute;
// True when tessellation is usable (glPatchParameteri resolved).  Geometry
// shaders need no extra entry point, so they ride on the core 3.2 context.
extern int glcoreHasTess;

// Resolve every pointer above; returns false (and logs the names) if any
// required function is missing.  GL context must be current.
int glcoreInit(void);

#ifdef __cplusplus
}
#endif
