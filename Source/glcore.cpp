// glcore.cpp — see glcore.h.  Pointers resolve via wglGetProcAddress with an
// opengl32.dll fallback (GL 1.1 exports are not returned by wgl).
/**
 * @file glcore.cpp
 * @brief Implements the glcore.h function-pointer loader: defines storage for every
 *        `glcore_<name>` pointer and glcoreInit(), which resolves them all via
 *        wglGetProcAddress (falling back to GetProcAddress on opengl32.dll for the
 *        GL 1.1 entry points wgl doesn't return).
 */
#include "glcore.h"
#include <stdio.h>

/**
 * @brief Defines the storage (zero-initialized) for one loaded GL function pointer.
 * @param name Name of the GL function whose `glcore_<name>` pointer is defined.
 */
#define GLC_DEF(name) PFN_##name glcore_##name = 0;

/// @name Storage for every GL function pointer declared in glcore.h; see there for grouping.
///@{
GLC_DEF(glActiveTexture)
GLC_DEF(glGenBuffers)
GLC_DEF(glBindBuffer)
GLC_DEF(glBufferData)
GLC_DEF(glBufferSubData)
GLC_DEF(glDeleteBuffers)
GLC_DEF(glMapBuffer)
GLC_DEF(glUnmapBuffer)
GLC_DEF(glGenVertexArrays)
GLC_DEF(glBindVertexArray)
GLC_DEF(glDeleteVertexArrays)
GLC_DEF(glEnableVertexAttribArray)
GLC_DEF(glDisableVertexAttribArray)
GLC_DEF(glVertexAttribPointer)
GLC_DEF(glGetAttribLocation)
GLC_DEF(glCreateShader)
GLC_DEF(glDeleteShader)
GLC_DEF(glShaderSource)
GLC_DEF(glCompileShader)
GLC_DEF(glGetShaderiv)
GLC_DEF(glGetShaderInfoLog)
GLC_DEF(glCreateProgram)
GLC_DEF(glDeleteProgram)
GLC_DEF(glAttachShader)
GLC_DEF(glDetachShader)
GLC_DEF(glLinkProgram)
GLC_DEF(glGetProgramiv)
GLC_DEF(glGetProgramInfoLog)
GLC_DEF(glUseProgram)
GLC_DEF(glGetUniformLocation)
GLC_DEF(glUniform1i)
GLC_DEF(glUniform2i)
GLC_DEF(glUniform1ui)
GLC_DEF(glUniform1f)
GLC_DEF(glUniform2f)
GLC_DEF(glUniform3f)
GLC_DEF(glUniform4f)
GLC_DEF(glUniform1fv)
GLC_DEF(glUniform1iv)
GLC_DEF(glUniform2fv)
GLC_DEF(glUniform3fv)
GLC_DEF(glUniformMatrix4fv)
GLC_DEF(glGenFramebuffers)
GLC_DEF(glBindFramebuffer)
GLC_DEF(glDeleteFramebuffers)
GLC_DEF(glFramebufferTexture2D)
GLC_DEF(glCheckFramebufferStatus)
GLC_DEF(glGenRenderbuffers)
GLC_DEF(glBindRenderbuffer)
GLC_DEF(glDeleteRenderbuffers)
GLC_DEF(glRenderbufferStorage)
GLC_DEF(glFramebufferRenderbuffer)
GLC_DEF(glGenerateMipmap)
GLC_DEF(glGetStringi)
GLC_DEF(glDispatchCompute)
GLC_DEF(glDispatchComputeIndirect)
GLC_DEF(glBindImageTexture)
GLC_DEF(glMemoryBarrier)
GLC_DEF(glBindBufferBase)
GLC_DEF(glClearBufferData)
GLC_DEF(glDrawArraysIndirect)
GLC_DEF(glDrawArraysInstanced)
GLC_DEF(glPatchParameteri)
GLC_DEF(glBlendFunci)
GLC_DEF(glDrawBuffers)
GLC_DEF(glClearBufferfv)
GLC_DEF(glTexImage3D)
GLC_DEF(glFramebufferTextureLayer)
GLC_DEF(glBlitFramebuffer)
GLC_DEF(glTexImage2DMultisample)
///@}

#undef GLC_DEF

int glcoreHasCompute = 0; ///< Definition of glcoreHasCompute; set by glcoreInit() once the compute pointers are resolved.
int glcoreHasTess    = 0; ///< Definition of glcoreHasTess; set by glcoreInit() once glPatchParameteri is resolved.

/**
 * @brief Resolves a single GL entry point by name.
 *
 * Tries wglGetProcAddress() first; some drivers return small sentinel values (1, 2,
 * 3, or -1 cast to a pointer) instead of NULL to signal failure for the older GL 1.1
 * entry points wgl doesn't handle, so those are treated as failures too and the
 * lookup falls back to GetProcAddress() on a lazily-loaded opengl32.dll.
 * @param name Name of the GL function to resolve.
 * @return The resolved function pointer, or NULL if it could not be found either way.
 */
static void *glcGet(const char *name)
{
    void *p = (void *)wglGetProcAddress(name);
    // wgl returns small sentinel values for failure on some drivers.
    if (p == 0 || p == (void*)1 || p == (void*)2 || p == (void*)3 || p == (void*)-1)
    {
        static HMODULE gl32 = 0;
        if (!gl32) gl32 = LoadLibraryA("opengl32.dll");
        p = gl32 ? (void *)GetProcAddress(gl32, name) : 0;
    }
    return p;
}

/**
 * @brief Resolves every declared GL function pointer, with the GL context current.
 *
 * Uses the local GLC_LOAD/GLC_LOAD_OPT macros: GLC_LOAD resolves a required entry
 * point and clears the overall success flag (and logs to stderr) if missing;
 * GLC_LOAD_OPT resolves an optional one (compute, tessellation, order-independent
 * transparency blending, frame-history-ring) and only logs, without failing the call.
 * Finishes by deriving glcoreHasCompute (all five core compute entry points present)
 * and glcoreHasTess (glPatchParameteri present), and logging a one-line summary of
 * which optional subsystems are available.
 * @return Non-zero (true) if every required entry point resolved, zero otherwise.
 */
int glcoreInit(void)
{
    int ok = 1;
#define GLC_LOAD(name) \
    glcore_##name = (PFN_##name)glcGet(#name); \
    if (!glcore_##name) { fprintf(stderr, "glcore: MISSING %s\n", #name); ok = 0; }
#define GLC_LOAD_OPT(name) \
    glcore_##name = (PFN_##name)glcGet(#name); \
    if (!glcore_##name) fprintf(stderr, "glcore: optional %s not available\n", #name);

    GLC_LOAD(glActiveTexture)
    GLC_LOAD(glGenBuffers)
    GLC_LOAD(glBindBuffer)
    GLC_LOAD(glBufferData)
    GLC_LOAD(glBufferSubData)
    GLC_LOAD(glDeleteBuffers)
    GLC_LOAD(glMapBuffer)
    GLC_LOAD(glUnmapBuffer)
    GLC_LOAD(glGenVertexArrays)
    GLC_LOAD(glBindVertexArray)
    GLC_LOAD(glDeleteVertexArrays)
    GLC_LOAD(glEnableVertexAttribArray)
    GLC_LOAD(glDisableVertexAttribArray)
    GLC_LOAD(glVertexAttribPointer)
    GLC_LOAD(glGetAttribLocation)
    GLC_LOAD(glCreateShader)
    GLC_LOAD(glDeleteShader)
    GLC_LOAD(glShaderSource)
    GLC_LOAD(glCompileShader)
    GLC_LOAD(glGetShaderiv)
    GLC_LOAD(glGetShaderInfoLog)
    GLC_LOAD(glCreateProgram)
    GLC_LOAD(glDeleteProgram)
    GLC_LOAD(glAttachShader)
    GLC_LOAD(glDetachShader)
    GLC_LOAD(glLinkProgram)
    GLC_LOAD(glGetProgramiv)
    GLC_LOAD(glGetProgramInfoLog)
    GLC_LOAD(glUseProgram)
    GLC_LOAD(glGetUniformLocation)
    GLC_LOAD(glUniform1i)
    GLC_LOAD(glUniform2i)
    GLC_LOAD(glUniform1ui)
    GLC_LOAD(glUniform1f)
    GLC_LOAD(glUniform2f)
    GLC_LOAD(glUniform3f)
    GLC_LOAD(glUniform4f)
    GLC_LOAD(glUniform1fv)
    GLC_LOAD(glUniform1iv)
    GLC_LOAD(glUniform2fv)
    GLC_LOAD(glUniform3fv)
    GLC_LOAD(glUniformMatrix4fv)
    GLC_LOAD(glGenFramebuffers)
    GLC_LOAD(glBindFramebuffer)
    GLC_LOAD(glDeleteFramebuffers)
    GLC_LOAD(glFramebufferTexture2D)
    GLC_LOAD(glCheckFramebufferStatus)
    GLC_LOAD(glGenRenderbuffers)
    GLC_LOAD(glBindRenderbuffer)
    GLC_LOAD(glDeleteRenderbuffers)
    GLC_LOAD(glRenderbufferStorage)
    GLC_LOAD(glFramebufferRenderbuffer)
    GLC_LOAD(glGenerateMipmap)
    GLC_LOAD(glGetStringi)
    // Compute (GL 4.3): required for the compute-shader path, but the app
    // still RUNS without it (fragment ping-pong fallbacks stay in place).
    GLC_LOAD_OPT(glDispatchCompute)
    GLC_LOAD_OPT(glDispatchComputeIndirect)
    GLC_LOAD_OPT(glBindImageTexture)
    GLC_LOAD_OPT(glMemoryBarrier)
    GLC_LOAD_OPT(glBindBufferBase)
    GLC_LOAD_OPT(glClearBufferData)
    GLC_LOAD_OPT(glDrawArraysIndirect)
    // Optional, not mandatory: only geom="mesh" scenes that ask for
    // instances="N" need it, and Scene3DShader falls back to a plain
    // glDrawArrays when the pointer is null.
    GLC_LOAD_OPT(glDrawArraysInstanced)
    GLC_LOAD_OPT(glPatchParameteri)
    GLC_LOAD_OPT(glBlendFunci)
    GLC_LOAD_OPT(glDrawBuffers)
    GLC_LOAD_OPT(glClearBufferfv)
    // Frame-History-Ring (optional: ohne sie bleiben Echo/Rewind einfach aus)
    GLC_LOAD_OPT(glTexImage3D)
    GLC_LOAD_OPT(glFramebufferTextureLayer)
    GLC_LOAD_OPT(glBlitFramebuffer)
    // MSAA for 3D scenes (optional: without it, scenes just render unaliased
    // as before -- see RenderPipeline::ensureMsaaTargets()).
    GLC_LOAD_OPT(glTexImage2DMultisample)

    glcoreHasCompute = ( glcore_glDispatchCompute && glcore_glBindImageTexture
                      && glcore_glMemoryBarrier   && glcore_glBindBufferBase
                      && glcore_glClearBufferData ) ? 1 : 0;
    // Geometry shaders need no extra entry point (core since 3.2); only
    // tessellation adds one, so glPatchParameteri is the whole test.
    glcoreHasTess = ( glcore_glPatchParameteri != 0 ) ? 1 : 0;

    fprintf( stderr, "glcore: compute pipeline %s, tessellation %s\n",
             glcoreHasCompute ? "available" : "NOT available (fragment fallbacks)",
             glcoreHasTess ? "available" : "NOT available" );

#undef GLC_LOAD
#undef GLC_LOAD_OPT
    return ok;
}
