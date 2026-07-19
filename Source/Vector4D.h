/*! \file Vector4d.h
  implements the classes Vector4D
  \author Frank Firsching
  \date 17.03.2001
 */

#ifndef VECTOR4D_H
#define VECTOR4D_H

#include "stdinc.h"


class Vector3D;

//! This class provides functions to handle 4-dimensional vectors
class Vector4D
{
 public:
  // public data-members for efficient access and manipulation
  //! x coordinate of the vector
  double x;
  //! y coordinate of the vector
  double y;
  //! z coordinate of the vector
  double z;
  //! w coordinate of the vector
  double w;

  //! default-constructor generates a zero-vector (with w=1)
  Vector4D();
  //! copy-constructor
  Vector4D(const Vector4D& b);
  //! project a 3D-vector to homogenous-space
  Vector4D(const Vector3D& b);
  //! initialize vector with explicit coordinates
  Vector4D(double X, double Y, double Z, double W);
  //! initialize vector with a pointer to 4 double values
  Vector4D(double* xyzw);
  
  //! destructor
  ~Vector4D();

  //! access to vector-elements with []-operator for a constant object
  inline double operator[](int i) const;
  //! access to vector-elements with []-operator for manipulation
  inline double& operator[](int i);

  //! Assigns the value of a vector to another
  inline Vector4D operator=(const Vector4D& b);
  //! Project a 3D vector to homogenous-space
  inline Vector4D operator=(const Vector3D& b);

  //! project a homogenous vector to 3D-space (cast operator to Vector3D)
  // inline operator Vector3D() const;
  //! returns the projection of a homogenous vector to 3D-space (results in w=1)
  inline Vector4D cartesian() const;
  //! project a homogenous vector to 3D-space (results in w=1)
  inline void cartesianize();

  //! return the index of the biggest element of the vector (does not consider w)
  inline int indexOfGreatestElement() const;
  //! return the value of the biggest element of the vector (does not consider w)
  inline double greatestElement() const;

 //! Addition of 2 vectors
  inline Vector4D operator+(const Vector4D& b) const;
  //! Subtraction of 2 vectors
  inline Vector4D operator-(const Vector4D& b) const;
  //! Negate the vector
  inline Vector4D operator-() const;
  //! Adds vector b to the operand
  inline void operator+=(const Vector4D& b);
  //! Subtracts vector b from the operand
  inline void operator-=(const Vector4D& b);

  //! multiply a vector by a scalar
  inline Vector4D operator*(double r) const;
  //! multiply the operand by a scalar
  inline void operator*=(double r);
  //! divide a vector by a scalar
  inline Vector4D operator/(double r) const;
  //! divide the operand by a scalar
  inline void operator/=(double r);

  //! check for equality
  inline bool operator==(const Vector4D& b) const;
  //! check for inequality
  inline bool operator!=(const Vector4D& b) const;

  //! cast the vector to a pointer of doubles (used to load the vector to OpenGL)
  inline operator double*();
};

#include "Vector3D.h"

// ********************************
// INLINE-functions for general use
// ********************************

//! write a 4D-vector to a stream
inline std::ostream& operator<<(std::ostream& s, const Vector4D& v)
{ return (s << v.x << " " << v.y << " " << v.z << " " << v.w); }

//! read a 4D-vector from a stream
inline std::istream& operator>>(std::istream& s, Vector4D& v)
{ return (s >> v.x >> v.y >> v.z >> v.w); }

//! The multiplication operator that allows the scalar value to preceed the vector.
inline Vector4D operator*(double r, const Vector4D& v)
{ return v*r; }

// *****************************
// INLINE-functions for Vector4D
// *****************************
inline double Vector4D::operator[](int i) const
{ 
  assert((i>=0)&&(i<4));
  return (&x)[i];
}

inline double& Vector4D::operator[](int i)
{ 
  assert((i>=0)&&(i<4));
  return (&x)[i];
}

inline Vector4D Vector4D::operator=(const Vector4D& b)
{
  x=b.x; y=b.y; z=b.z; w=b.w;
  return *this;
}

inline Vector4D Vector4D::operator=(const Vector3D& b)
{
  x=b.x; y=b.y; z=b.z; w=1.0;
  return *this;
}

/*
inline Vector4D::operator Vector3D() const
{ return Vector3D(x/w,y/w,z/w); }
*/

inline Vector4D Vector4D::cartesian() const
{ return Vector4D(x/w, y/w, z/w, 1.0); }

inline void Vector4D::cartesianize()
{  x/=w; y/=w; z/=w; w=1.0; }

inline int Vector4D::indexOfGreatestElement() const
{ return (x<y)?((y<z)?2:1):((x<z)?2:0); }

inline double Vector4D::greatestElement() const
{ return (x<y)?((y<z)?z:y):((x<z)?z:x); }

inline Vector4D Vector4D::operator+(const Vector4D& b) const
{ return Vector4D(x+b.x, y+b.y, z+b.z, w+b.w); }

inline Vector4D Vector4D::operator-(const Vector4D& b) const
{ return Vector4D(x-b.x, y-b.y, z-b.z, w-b.w); }

inline Vector4D Vector4D::operator-() const
{ return Vector4D(-x,-y,-z,-w); }

inline void Vector4D::operator+=(const Vector4D& b)
{ x+=b.x; y+=b.y; z+=b.z; w+=b.w; }

inline void Vector4D::operator-=(const Vector4D& b)
{ x-=b.x; y-=b.y; z-=b.z; w-=b.w; }

inline Vector4D Vector4D::operator*(double r) const
{ return Vector4D(r*x,r*y,r*z,r*w); }

inline void Vector4D::operator*=(double r)
{ x*=r; y*=r; z*=r; w*=r; }

inline Vector4D Vector4D::operator/(double r) const
{ 
  assert(r!=0.0);
  return Vector4D(x/r,y/r,z/r,w/r); 
}

inline void Vector4D::operator/=(double r)
{ 
  assert(r!=0.0);
  x/=r; y/=r; z/=r; w/=r;
}

inline bool Vector4D::operator==(const Vector4D& b) const
{ return (x==b.x && y==b.y && z==b.z && w==b.w); }

inline bool Vector4D::operator!=(const Vector4D& b) const
{ return (x!=b.x || y!=b.y || z!=b.z || w!=b.w); }

inline Vector4D::operator double*()
{ return &x; }


#endif
