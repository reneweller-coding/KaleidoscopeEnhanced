/**
 * @file Compat/GL/GLU.h
 * @brief Wrapper header that makes `#include <GL/GLU.h>` resolve off Windows.
 *
 * Nine translation units spell the header the way the Windows SDK ships it,
 * GL/GLU.h. Linux installs the very same header as GL/glu.h and its filesystem
 * cares about the difference; macOS puts it somewhere else again, inside the
 * OpenGL framework. Rather than retouch those nine include lines -- the port's
 * rule is that the reference build's token stream stays exactly as it is --
 * CMakeLists.txt puts Compat/ on the include path, and that build alone. The
 * Windows project never sees this file.
 *
 * #include_next, not #include: it resumes the search AFTER the directory this
 * file was found in, so the system header is picked up even when the source
 * tree sits on a case-INSENSITIVE filesystem -- which is not a corner case at
 * all. It is how this port was first built (a Windows drive mounted into WSL)
 * and it is the default on macOS. A plain #include <GL/glu.h> there finds THIS
 * file again; the include guard then stops the recursion and the result is an
 * empty header, so the build fails on a missing gluErrorString rather than on
 * a missing file, several steps away from the cause.
 *
 * Both compilers that ever read this file (GCC, Clang) support #include_next.
 */
#ifndef KALEIDOSCOPE_COMPAT_GLU_H
#define KALEIDOSCOPE_COMPAT_GLU_H

#if defined(__APPLE__)
#include <OpenGL/glu.h>
#else
#include_next <GL/glu.h>
#endif

#endif
