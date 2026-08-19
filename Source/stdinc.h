/*! \file stdinc.h
  simply includes some standard headers, and makes sure, that STL-files like `<string>`
  are included before "base/MemoryLeak.h", which would cause an error if done the other
  way round.
  The reason therefore is, that MemoryLeak redefines the new and delete operators.
  This is done via a hack using the preprocessor, which doesn't allow overloading
  new and delete for a special class, like it is done in the GNU-STL.

  \author Frank Firsching
  \date 15.09.2001
 */
/**
 * @file stdinc.h
 * @brief Common precompiled-header-style include: pulls in the standard C/C++ headers
 *        used throughout the math/engine code (STL containers/streams, math.h,
 *        assert.h), defines M_PI/EPSILON fallbacks, and pulls in the Qt6 qrand()
 *        compatibility shims. Included by Vector3D.h/Vector4D.h and other low-level
 *        headers so callers get a consistent base set of declarations.
 */

#ifndef STDINC_H
#define STDINC_H

//! Fallback definition of pi, in case the platform's math.h doesn't provide one.
#ifndef M_PI
#define M_PI 3.141592653589793238462643383279502884197169399375105820974944592308
#endif

//! Small tolerance value used for floating-point comparisons across the math code.
#ifndef EPSILON
#define EPSILON 0.00000001
#endif

#include <math.h>
#include <assert.h>

#include <algorithm>
#include <fstream>
#include <iostream>
#include <list>
#include <string>
#include <vector>
#include <stack>

#include "qt6compat.h"   // qrand()/qsrand() shims for Qt6

#endif
