/*! \file Vector3D.cpp
  implements the class Vector3D
  \author Frank Firsching
  \date 17.03.2001
*/
/**
 * @file Vector3D.cpp
 * @brief Implements the non-inline members of Vector3D: the constructors/destructor
 *        and the reflect/refract geometry helpers (the rest of Vector3D is implemented
 *        inline in Vector3D.h).
 */

#include "Vector3D.h"


// *****************************
// IMPLEMENTATION of Vector3D
// *****************************

/// @brief Default-constructs the zero vector (0,0,0).
Vector3D::Vector3D()
{ x=y=z=0; }

/// @brief Copy-constructs from another Vector3D.
Vector3D::Vector3D(const Vector3D& b)
{ x=b.x; y=b.y; z=b.z; }

/// @brief Projects a homogeneous Vector4D into 3D space (divides x,y,z by w).
Vector3D::Vector3D(const Vector4D& b)
{ x=b.x/b.w; y=b.y/b.w; z=b.z/b.w; }

/// @brief Constructs a vector from explicit x, y, z coordinates.
Vector3D::Vector3D(float X, float Y, float Z)
{ x=X; y=Y; z=Z; }

/// @brief Constructs a vector from a pointer to 3 consecutive floats.
Vector3D::Vector3D(float* xyz)
{ x=xyz[0]; y=xyz[1]; z=xyz[2]; }

/// @brief Destructor (no-op; the class owns no dynamic resources).
Vector3D::~Vector3D()
{}

/**
 * @brief Computes the reflection of this vector about normal @p n.
 *
 * Standard mirror-reflection formula `2*(this . n)*n - this`. The CG_EXERCISE_10_3
 * branch is a teaching-exercise stub left over from the code's origin (a computer
 * graphics course assignment) where the method body was intentionally disabled for
 * students to fill in; it is not defined in this codebase's builds.
 * @param n Reflection normal (assumed normalized).
 * @return The reflected vector.
 */
Vector3D Vector3D::reflected(const Vector3D& n) const
{
#ifndef CG_EXERCISE_10_3
  return (2*((*this)*n)*n - (*this));
#else
  cerr << "the reflect-method is disabled for this assignment" << endl;
#endif
}

/**
 * @brief Computes the refraction of this vector through an interface with normal @p n.
 *
 * Flips the normal to face the incident vector, then applies Snell's law with ratio
 * @p eta; if the term under the square root goes negative the interface exhibits total
 * internal reflection, in which case @p totalInternalReflection is set and the
 * original (unrefracted) vector is returned. See the CG_EXERCISE_10_3 note on
 * reflected() above.
 * @param n Interface normal (assumed normalized).
 * @param eta Ratio of indices of refraction (incident / transmitted medium).
 * @param totalInternalReflection Output flag set to true on total internal reflection.
 * @return The refracted vector, or the original vector on total internal reflection.
 */
Vector3D Vector3D::refracted(const Vector3D& n, float eta, bool& totalInternalReflection) const
{
#ifndef CG_EXERCISE_10_3
  Vector3D nn= (((*this) * n) > 0) ? -n : n;
  Vector3D tmp= ((*this) - nn * (nn*(*this))) * eta;
  float length= 1 - (tmp*tmp);
  totalInternalReflection = (length < 0);
  return ((length < 0) ? (*this) : nn * -sqrt(length) + tmp);
#else
  cerr << "the refract-method is disabled for this assignment" << endl;
#endif
}
