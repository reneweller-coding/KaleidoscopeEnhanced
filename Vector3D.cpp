/*! \file Vector3D.C
  implements the class Vector3D
  \author Frank Firsching
  \date 17.03.2001
*/

#include "Vector3D.h"


// *****************************
// IMPLEMENTATION of Vector3D
// *****************************
Vector3D::Vector3D()
{ x=y=z=0; }

Vector3D::Vector3D(const Vector3D& b)
{ x=b.x; y=b.y; z=b.z; }

Vector3D::Vector3D(const Vector4D& b)
{ x=b.x/b.w; y=b.y/b.w; z=b.z/b.w; }

Vector3D::Vector3D(float X, float Y, float Z)
{ x=X; y=Y; z=Z; }

Vector3D::Vector3D(float* xyz)
{ x=xyz[0]; y=xyz[1]; z=xyz[2]; }

Vector3D::~Vector3D()
{}

Vector3D Vector3D::reflected(const Vector3D& n) const
{ 
#ifndef CG_EXERCISE_10_3
  return (2*((*this)*n)*n - (*this));
#else
  cerr << "the reflect-method is disabled for this assignment" << endl;
#endif
}
  
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
