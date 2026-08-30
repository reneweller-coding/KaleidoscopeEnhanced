/**
 * @file Platform.h
 * @brief The thin seam between this codebase and the operating system.
 *
 * Kaleidoscope grew up on Windows, and the Windows build is the reference: every
 * function here is a PASS-THROUGH under _WIN32, compiled to nothing, so the
 * Windows translation units see exactly the code they always saw. Everything
 * with a body only exists on the other platforms.
 *
 * That asymmetry is deliberate and load-bearing. The audio analyser's feedback
 * loops amplify a 1e-6 seed to 35 % within seconds (see the project notes on
 * processBlock's FP sensitivity), so even a harmless-looking reformulation of
 * Windows code can move the picture. The rule for this file, and for the
 * platform work generally: never edit a line the Windows compiler reads --
 * only wrap it.
 *
 * What lives here:
 *   - assetPath()  : separator normalisation for the asset paths baked into the
 *                    shaders' C++ call sites and the preset XML (both use "\").
 *   - glProcAddress(): the GL entry-point resolver, wgl/glX/dlsym.
 * Optional Windows-only subsystems (Spout, WinRT now-playing, winmm MIDI) are
 * not abstracted -- they are compiled out entirely and their callers already
 * handle "not available", which is the honest model: a Linux box has no Spout.
 */
#ifndef KALEIDOSCOPE_PLATFORM_H
#define KALEIDOSCOPE_PLATFORM_H

#include <string>


namespace Platform {

/**
 * @brief Normalises an asset path's separators for the host filesystem.
 *
 * Shader paths are written "..\\Engine\\CfxFlame.comp" in the C++ call sites and
 * "..\\Scene2D\\X.frag" in every preset entry -- 831 of them, plus the model=
 * attributes. On Windows a backslash IS the separator and this returns the
 * string untouched (the call compiles away). On POSIX a backslash is an ordinary
 * filename character, so "..\\Scene2D\\X.frag" is one absurd filename that
 * cannot be opened; the separators are rewritten instead of rewriting the
 * catalogue, because the catalogue is generated and shared between platforms.
 *
 * @param p Path as written in the source or the preset.
 * @return The same path with separators the host understands.
 */
inline std::string assetPath( const std::string &p )
{
#ifdef _WIN32
	return p;
#else
	std::string s = p;
	for( char &c : s )
		if( c == '\\' ) c = '/';
	return s;
#endif
}

/**
 * @brief ASCII case-insensitive string compare -- MSVC's _stricmp elsewhere.
 *
 * Written out rather than delegating to POSIX strcasecmp, because reaching it
 * means including <strings.h>, and Source/ is on the include path: on a
 * case-INSENSITIVE filesystem (a Windows drive mounted into WSL, or plain
 * macOS) that include finds this project's own Source/Strings.h instead, and
 * the failure surfaces as a missing strcasecmp with no hint of why.
 *
 * ASCII-only is sufficient and intended: the one caller compares a two-letter
 * language code.
 */
inline int iCaseCmp( const char *a, const char *b )
{
	for( ;; ++a, ++b )
	{
		const unsigned char ca = (unsigned char)( *a >= 'A' && *a <= 'Z' ? *a + 32 : *a );
		const unsigned char cb = (unsigned char)( *b >= 'A' && *b <= 'Z' ? *b + 32 : *b );
		if( ca != cb ) return int( ca ) - int( cb );
		if( !ca )      return 0;
	}
}
/**
 * @brief Resolves an OpenGL entry point by name.
 *
 * Only used on non-Windows: glcore.cpp keeps its original wglGetProcAddress
 * path (with the small-sentinel workaround it needs for certain drivers)
 * untouched under _WIN32.
 *
 * @param name Entry-point name, e.g. "glDrawArraysInstanced".
 * @return Function pointer, or nullptr if this GL implementation lacks it.
 */
#ifndef _WIN32
void *glProcAddress( const char *name );
#endif

} // namespace Platform

#ifndef _WIN32
#define _stricmp ::Platform::iCaseCmp
#endif


#endif // KALEIDOSCOPE_PLATFORM_H
