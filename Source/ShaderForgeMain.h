/**
 * @file ShaderForgeMain.h
 * @brief Command-line entry of the ShaderForge helper (see ShaderForge.h): both executables forge.
 *
 * No glcore here: the helper draws through Qt's GL functions.
 */
#pragma once

/// @return True if the command line asks for the forge ("--forge ..." or "--forgeload ...").
bool shaderForgeIsCommand( int argc, char *argv[] );
/**
 * @brief Runs the forge command and returns the process exit code.
 *
 *   --forge <frag> <out.bin> <targets> <vert>   build, warm-draw into <targets> RGBA32F targets, write the binary
 *   --forge-serve                               the same for every line "frag\tout.bin\ttargets\tvert" on stdin (the app's helper)
 *   --forgeload <bin> [targets]                 time loading a binary and its first draw (diagnosis)
 */
int  shaderForgeMain( int argc, char *argv[] );
