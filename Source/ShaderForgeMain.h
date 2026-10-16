/**
 * @file ShaderForgeMain.h
 * @brief Command-line entry of the ShaderForge helper (see ShaderForge.h): both executables forge.
 *
 * No glcore here: the helper draws through Qt's GL functions.
 */
#pragma once

/**  Whether the command line asks for the forge (--forge, --forgeload or --forge-serve).
 *
 * @param argc  Number of command-line arguments. (in)
 * @param argv  The arguments. (in)
 *
 * @return
 *   True if the command line asks for the forge ("--forge ..." or "--forgeload ...").
 **/
bool shaderForgeIsCommand( int argc, char *argv[] );
/**  Runs the forge command and returns the process exit code.
 *
 * @param argc  Number of command-line arguments. (in)
 * @param argv  The arguments; argv[1] is the forge command. (in)
 *
 * @return
 *   The process exit code: 0 on success, 2 for a usage error, 1 if the build failed.
 *
 * @code
 *   --forge FRAG OUT.bin TARGETS VERT   build, warm-draw into TARGETS RGBA32F targets, write the binary
 *   --forge-serve                       the same for every line "FRAG\tOUT.bin\tTARGETS\tVERT" on stdin (the app's
 * helper)
 *   --forgeload BIN [TARGETS]           time loading a binary and its first draw (diagnosis)
 * @endcode
 **/
int shaderForgeMain( int argc, char *argv[] );
