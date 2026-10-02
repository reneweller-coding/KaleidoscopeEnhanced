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
 * @code
 *   --forge FRAG OUT.bin TARGETS VERT   build, warm-draw into TARGETS RGBA32F targets, write the binary
 *   --forge-serve                       the same for every line "FRAG\tOUT.bin\tTARGETS\tVERT" on stdin (the app's helper)
 *   --forgeload BIN [TARGETS]           time loading a binary and its first draw (diagnosis)
 * @endcode
 */
int  shaderForgeMain( int argc, char *argv[] );
