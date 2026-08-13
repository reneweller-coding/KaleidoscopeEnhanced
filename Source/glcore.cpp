// glcore.cpp — see glcore.h.  Pointers resolve via wglGetProcAddress with an
// opengl32.dll fallback (GL 1.1 exports are not returned by wgl).
#include "glcore.h"
#include <stdio.h>

#define GLC_DEF(name) PFN_##name glcore_##name = 0;

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

#undef GLC_DEF

int glcoreHasCompute = 0;

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

    glcoreHasCompute = ( glcore_glDispatchCompute && glcore_glBindImageTexture
                      && glcore_glMemoryBarrier   && glcore_glBindBufferBase
                      && glcore_glClearBufferData ) ? 1 : 0;
    fprintf( stderr, "glcore: compute pipeline %s\n",
             glcoreHasCompute ? "available" : "NOT available (fragment fallbacks)" );

#undef GLC_LOAD
#undef GLC_LOAD_OPT
    return ok;
}
