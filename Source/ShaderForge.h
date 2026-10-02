/**
 * @file ShaderForge.h
 * @brief Fragment programs built in a helper process and kept as driver program binaries on disk.
 *
 * Compiling a big shader stalls the render thread on the NVIDIA driver --
 * 0.4 to 5 s, also with GL_KHR_parallel_shader_compile and also from a second
 * context in this process (measured 01.10.2026).  A separate process does
 * not: a second instance of this executable (--forge-serve, ShaderForgeMain.h,
 * started once with the app and fed one job per line) compiles and links the
 * source, draws once and writes the driver's program binary; this process
 * only loads it with glProgramBinary (the 5 s chain lab: 18 ms).  One helper
 * for the session: a process per program made a GL context each time, and
 * each creation cost the app two frame gaps of ~55 ms.
 *
 * What a binary cannot carry: the driver finishes the GPU code at
 * the program's first draw (a 3D-lab world: 25-35 ms in the app) and caches
 * that per executable, read only when a process starts -- so the helper is
 * this executable and its warm draw spares the NEXT sessions; the running one
 * pays once per new program (kept small: make_chainpass's one-site geometry).
 * A binary appears by a rename, so it is never read half-written.  The binaries live in
 * %LOCALAPPDATA%\\KaleidoscopeVisualizer\\ShaderCache, keyed by the source and
 * the GPU / driver, so a program is built once and loads instantly in every
 * later session.
 */
#pragma once
#include <string>
#include "glcore.h"

/// @brief Finds the helper and the cache (GL context current). @return True if programs can be forged.
bool   shaderForgeInit();
/// @return True once shaderForgeInit() found a helper and a cache directory.
bool   shaderForgeAvailable();
/**
 * @brief The program for this fragment source (with the shared fullscreen vertex shader).
 *
 * From the disk cache if it is there (loaded now, a few ms), else the build
 * is queued on the helper and 0 is returned until it is
 * done -- poll again on a later frame.  The returned program belongs to the
 * forge (cached for the session); callers must not delete it.
 * @param fragSource Complete fragment shader text.
 * @param failed Set to true if the build failed (the helper's log is printed once).
 * @param targets RGBA32F colour targets of the helper's warm draw, as the program's real target (the 3D lab's
 *        G-buffer: 2) -- the GPU code the driver caches for later sessions is the one for that target.
 * @return The linked program, or 0 while it is being built (or on failure).
 */
GLuint shaderForgeGet( const std::string &fragSource, bool *failed = nullptr, int targets = 1 );
