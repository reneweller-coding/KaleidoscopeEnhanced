/**
 * @file ShaderWorker.h
 * @brief A thread with its own GL context (sharing objects with the main one) that compiles and links fragment programs off the render thread.
 *
 * GL_KHR_parallel_shader_compile was not enough: on the NVIDIA driver the
 * build reported itself complete, and the first GL_LINK_STATUS query on the
 * render thread then blocked for ~0.8 s per chain-lab variant -- a visible
 * freeze every time the lab walked.  Here the whole build, link status and a
 * glFinish run on the worker; the render thread only receives finished,
 * linked programs.  Where the worker cannot start (no shareable context), the
 * callers keep their old paths.
 */
#pragma once
#include <string>
#include "glcore.h"

class QOpenGLContext;

/**
 * @brief Starts the worker (GUI thread, with the main context current, after glcoreInit()).
 * @param share The main GL context; the worker's context shares objects with it.
 * @return True if the worker runs.
 */
bool shaderWorkerStart( QOpenGLContext *share );
/// @return True if the worker runs and still shares objects with the current context.
bool shaderWorkerUsable();
/**
 * @brief Queues a build: the shared fullscreen vertex shader plus this fragment source.
 * @param key Returned unchanged with the result.
 * @param fragSource Complete fragment shader text.
 */
void shaderWorkerSubmit( const std::string &key, const std::string &fragSource );
/**
 * @brief Takes one finished build (render thread).
 * @param key The job's key.
 * @param prog The linked program (0 if the build failed; the worker printed its log).
 * @return False if nothing has finished.
 */
bool shaderWorkerCollect( std::string &key, GLuint &prog );
