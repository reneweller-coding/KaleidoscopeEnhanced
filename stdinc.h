/*! \file stdinc.h
  simply includes some standard headers, and makes sure, that STL-files like <string>
  are included before "base/MemoryLeak.h", which would cause an error if done the other
  way round. 
  The reason therefore is, that MemoryLeak redefines the new and delete operators.
  This is done via a hack using the preprocessor, which doesn't allow overloading
  new and delete for a special class, like it is done in the GNU-STL.
  
  \author Frank Firsching
  \date 15.09.2001
 */

#ifndef SRDINC_H
#define SRDINC_H

#ifndef M_PI
#define M_PI 3.141592653589793238462643383279502884197169399375105820974944592308
#endif

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
