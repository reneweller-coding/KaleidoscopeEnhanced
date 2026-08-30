/**
 * @file Platform.cpp
 * @brief Non-Windows half of the platform seam (see Platform.h).
 *
 * The whole file is inside #ifndef _WIN32: on Windows it compiles to an empty
 * translation unit, so it cannot affect the reference build even by accident.
 */
#include "Platform.h"

#ifndef _WIN32

#include <dlfcn.h>

#if defined(__APPLE__)
	// macOS has no glX. Entry points live in the OpenGL framework and are
	// resolved with dlsym against the already-loaded image -- RTLD_DEFAULT
	// searches everything the process has open, which includes the framework
	// once Qt has created a context.
	#include <cstddef>
#else
	#include <GL/glx.h>
#endif

namespace Platform {

void *glProcAddress( const char *name )
{
#if defined(__APPLE__)
	return dlsym( RTLD_DEFAULT, name );
#else
	// glXGetProcAddress returns a pointer for names the driver knows even when
	// the extension is absent from the current context, so callers must still
	// check the GL version/extension string -- which glcore already does. The
	// dlsym fallback covers implementations where the GLX entry point itself
	// is missing (some software rasterisers).
	void *p = (void *) glXGetProcAddress( (const GLubyte *) name );
	if( !p )
		p = dlsym( RTLD_DEFAULT, name );
	return p;
#endif
}

} // namespace Platform

#endif // !_WIN32
