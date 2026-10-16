//---------------------------------------------------------------------------
//                              Vector4D
//---------------------------------------------------------------------------
//  Copyright (C): 2001 Frank Firsching; changes 2026 reneweller, MIT License (see LICENSE)
//---------------------------------------------------------------------------
/*! @file
 *
 *  @brief
 *  Small header-only 4D (homogeneous) vector math type (double xyzw), used together with Vector3D for
 *  homogeneous-coordinate math (e.g. projecting 3D points to/from clip/homogeneous space).
 *
 *  Implements the classes Vector4D.
 *
 *  @author Frank Firsching (17.03.2001); adapted by René Weller
 */

#ifndef VECTOR4D_H
#define VECTOR4D_H

#include "stdinc.h"


class Vector3D;

/** @class Vector4D
 *
 * A 4-dimensional homogeneous vector of doubles (x, y, z, w).
 *
 * Provides the usual arithmetic operators plus conversions to/from Vector3D
 * (constructing/assigning from a Vector3D sets w=1; converting the other way is done
 * via Vector3D's own constructor/assignment, which divides by w). cartesian() /
 * cartesianize() perform the perspective divide, normalizing w back to 1. Coordinates
 * are public data members for direct access, and the class exposes a `double*` cast
 * for interop with APIs expecting a raw `double[4]`.
 **/
class Vector4D
{
public:
    // public data-members for efficient access and manipulation
    /** x coordinate of the vector */
    double x;
    /** y coordinate of the vector */
    double y;
    /** z coordinate of the vector */
    double z;
    /** w coordinate of the vector */
    double w;

    /** default-constructor generates a zero-vector (with w=1) */
    Vector4D();
    /**  copy-constructor
     *
     * @param b  The vector to copy. (in)
     **/
    Vector4D( const Vector4D &b );
    /**  project a 3D-vector to homogenous-space
     *
     * @param b  The 3D vector. (in)
     **/
    explicit Vector4D( const Vector3D &b );
    /**  initialize vector with explicit coordinates
     *
     * @param X  The x coordinate. (in)
     * @param Y  The y coordinate. (in)
     * @param Z  The z coordinate. (in)
     * @param W  The homogeneous coordinate. (in)
     **/
    Vector4D( double X, double Y, double Z, double W );
    /**  initialize vector with a pointer to 4 double values
     *
     * @param xyzw  Points to x, y, z and w. (in)
     **/
    explicit Vector4D( double *xyzw );

    /** destructor */
    ~Vector4D();

    /**  access to vector-elements with []-operator for a constant object
     *
     * @param i  0..3 for x, y, z, w. (in)
     *
     * @return
     *   The component.
     **/
    inline double operator[]( int i ) const;
    /**  access to vector-elements with []-operator for manipulation
     *
     * @param i  0..3 for x, y, z, w. (in)
     *
     * @return
     *   A reference to the component.
     **/
    inline double &operator[]( int i );

    /**  Assigns the value of a vector to another
     *
     * @param b  The vector to copy. (in)
     **/
    inline void operator=( const Vector4D &b );
    /**  Project a 3D vector to homogenous-space
     *
     * @param b  The 3D vector (w becomes 1). (in)
     **/
    inline void operator=( const Vector3D &b );

    //! project a homogenous vector to 3D-space (cast operator to Vector3D)
    // inline operator Vector3D() const;
    /**  returns the projection of a homogenous vector to 3D-space (results in w=1)
     *
     * @return
     *   (x/w, y/w, z/w, 1); w must not be 0.
     **/
    inline Vector4D cartesian() const;
    /** project a homogenous vector to 3D-space (results in w=1) */
    inline void cartesianize();

    /**  return the index of the biggest element of the vector (does not consider w)
     *
     * @return
     *   0, 1 or 2: the largest of x, y, z.
     **/
    inline int indexOfGreatestElement() const;
    /**  return the value of the biggest element of the vector (does not consider w)
     *
     * @return
     *   The largest of x, y, z.
     **/
    inline double greatestElement() const;

    /**  Addition of 2 vectors
     *
     * @param b  The vector to add. (in)
     *
     * @return
     *   The sum.
     **/
    inline Vector4D operator+( const Vector4D &b ) const;
    /**  Subtraction of 2 vectors
     *
     * @param b  The vector to subtract. (in)
     *
     * @return
     *   The difference.
     **/
    inline Vector4D operator-( const Vector4D &b ) const;
    /**  Negate the vector
     *
     * @return
     *   The negated vector (w too).
     **/
    inline Vector4D operator-() const;
    /**  Adds vector b to the operand
     *
     * @param b  The vector to add. (in)
     **/
    inline void operator+=( const Vector4D &b );
    /**  Subtracts vector b from the operand
     *
     * @param b  The vector to subtract. (in)
     **/
    inline void operator-=( const Vector4D &b );

    /**  multiply a vector by a scalar
     *
     * @param r  The scale factor. (in)
     *
     * @return
     *   The scaled vector.
     **/
    inline Vector4D operator*( double r ) const;
    /**  multiply the operand by a scalar
     *
     * @param r  The scale factor. (in)
     **/
    inline void operator*=( double r );
    /**  divide a vector by a scalar
     *
     * @param r  The divisor; must not be 0. (in)
     *
     * @return
     *   The divided vector.
     **/
    inline Vector4D operator/( double r ) const;
    /**  divide the operand by a scalar
     *
     * @param r  The divisor; must not be 0. (in)
     **/
    inline void operator/=( double r );

    /**  check for equality
     *
     * @param b  The other vector. (in)
     *
     * @return
     *   True if all four components are equal.
     **/
    inline bool operator==( const Vector4D &b ) const;
    /**  check for inequality
     *
     * @param b  The other vector. (in)
     *
     * @return
     *   True if any component differs.
     **/
    inline bool operator!=( const Vector4D &b ) const;

    /** cast the vector to a pointer of doubles (used to load the vector to OpenGL) */
    inline explicit operator double *();
};

#include "Vector3D.h"

// ********************************
// INLINE-functions for general use
// ********************************

/**  write a 4D-vector to a stream
 *
 * @param s  The stream. (in,out)
 * @param v  The vector. (in)
 *
 * @return
 *   The stream.
 **/
inline std::ostream &operator<<( std::ostream &s, const Vector4D &v )
{
    return ( s << v.x << " " << v.y << " " << v.z << " " << v.w );
}

/**  read a 4D-vector from a stream
 *
 * @param s  The stream. (in,out)
 * @param v  Receives the vector. (out)
 *
 * @return
 *   The stream.
 **/
inline std::istream &operator>>( std::istream &s, Vector4D &v )
{
    return ( s >> v.x >> v.y >> v.z >> v.w );
}

/**  The multiplication operator that allows the scalar value to preceed the vector.
 *
 * @param r  The scale factor. (in)
 * @param v  The vector. (in)
 *
 * @return
 *   The scaled vector.
 **/
inline Vector4D operator*( double r, const Vector4D &v )
{
    return v * r;
}

// *****************************
// INLINE-functions for Vector4D
// *****************************
inline double Vector4D::operator[]( int i ) const
{
    assert( ( i >= 0 ) && ( i < 4 ) );
    return ( &x )[i];
}

inline double &Vector4D::operator[]( int i )
{
    assert( ( i >= 0 ) && ( i < 4 ) );
    return ( &x )[i];
}

inline void Vector4D::operator=( const Vector4D &b )
{
    x = b.x;
    y = b.y;
    z = b.z;
    w = b.w;
}

inline void Vector4D::operator=( const Vector3D &b )
{
    x = b.x;
    y = b.y;
    z = b.z;
    w = 1.0;
}

/*
inline Vector4D::operator Vector3D() const
{ return Vector3D(x/w,y/w,z/w); }
*/

inline Vector4D Vector4D::cartesian() const
{
    return Vector4D( x / w, y / w, z / w, 1.0 );
}

inline void Vector4D::cartesianize()
{
    x /= w;
    y /= w;
    z /= w;
    w = 1.0;
}

inline int Vector4D::indexOfGreatestElement() const
{
    return ( x < y ) ? ( ( y < z ) ? 2 : 1 ) : ( ( x < z ) ? 2 : 0 );
}

inline double Vector4D::greatestElement() const
{
    return ( x < y ) ? ( ( y < z ) ? z : y ) : ( ( x < z ) ? z : x );
}

inline Vector4D Vector4D::operator+( const Vector4D &b ) const
{
    return Vector4D( x + b.x, y + b.y, z + b.z, w + b.w );
}

inline Vector4D Vector4D::operator-( const Vector4D &b ) const
{
    return Vector4D( x - b.x, y - b.y, z - b.z, w - b.w );
}

inline Vector4D Vector4D::operator-() const
{
    return Vector4D( -x, -y, -z, -w );
}

inline void Vector4D::operator+=( const Vector4D &b )
{
    x += b.x;
    y += b.y;
    z += b.z;
    w += b.w;
}

inline void Vector4D::operator-=( const Vector4D &b )
{
    x -= b.x;
    y -= b.y;
    z -= b.z;
    w -= b.w;
}

inline Vector4D Vector4D::operator*( double r ) const
{
    return Vector4D( r * x, r * y, r * z, r * w );
}

inline void Vector4D::operator*=( double r )
{
    x *= r;
    y *= r;
    z *= r;
    w *= r;
}

inline Vector4D Vector4D::operator/( double r ) const
{
    assert( r != 0.0 );
    return Vector4D( x / r, y / r, z / r, w / r );
}

inline void Vector4D::operator/=( double r )
{
    assert( r != 0.0 );
    x /= r;
    y /= r;
    z /= r;
    w /= r;
}

inline bool Vector4D::operator==( const Vector4D &b ) const
{
    return ( x == b.x && y == b.y && z == b.z && w == b.w );
}

inline bool Vector4D::operator!=( const Vector4D &b ) const
{
    return ( x != b.x || y != b.y || z != b.z || w != b.w );
}

inline Vector4D::operator double *()
{
    return &x;
}


#endif
