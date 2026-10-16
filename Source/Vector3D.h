//---------------------------------------------------------------------------
//                              Vector3D
//---------------------------------------------------------------------------
//  Copyright (C): 2001 Frank Firsching; changes 2026 reneweller, MIT License (see LICENSE)
//---------------------------------------------------------------------------
/*! @file
 *
 *  @brief
 *  Small 3D vector math type (float xyz) with the usual arithmetic, geometric (cross/dot product, angle,
 *  reflect/refract) and normalization operations, used throughout the engine's math/geometry code.
 *
 *  Implements the class Vector3D.
 *
 *  @author Frank Firsching (17.03.2001); adapted by René Weller
 */

#ifndef VECTOR3D_H
#define VECTOR3D_H

#include "stdinc.h"


// forward-declaration of the 4-dimensional vector
class Vector4D;

/** @class Vector3D
 *
 * A 3-dimensional vector of floats (x, y, z).
 *
 * Provides the standard set of vector-math operators (add/subtract/scale, dot and
 * cross product, length/normalization, reflection and refraction) plus interop with
 * the homogeneous Vector4D type (construction from / assignment from / to a Vector4D
 * performs the perspective divide by w). Coordinates are public data members for
 * efficient, direct access, and the class exposes a `float*` cast so instances can be
 * passed straight into OpenGL calls that expect a `float[3]`.
 **/
class Vector3D
{
public:
    // public data-members for efficient access and manipulation
    /** x coordinate of the vector */
    float x;
    /** y coordinate of the vector */
    float y;
    /** z coordinate of the vector */
    float z;

    /** default-constructor generates a zero-vector */
    Vector3D();
    /**  copy-constructor
     *
     * @param b  The vector to copy. (in)
     **/
    Vector3D( const Vector3D &b );
    /**  project a homogenous vector to 3D-space
     *
     * @param b  The homogeneous vector; w must not be 0. (in)
     **/
    explicit Vector3D( const Vector4D &b );
    /**  initialize vector with explicit coordinates
     *
     * @param X  The x coordinate. (in)
     * @param Y  The y coordinate. (in)
     * @param Z  The z coordinate. (in)
     **/
    Vector3D( float X, float Y, float Z );
    /**  initialize vector with a pointer to 3 float values
     *
     * @param xyz  Points to x, y and z. (in)
     **/
    explicit Vector3D( float *xyz );

    /** destructor */
    ~Vector3D();

    /**  access to vector-elements with []-operator for a constant object
     *
     * @param i  0, 1 or 2 for x, y, z. (in)
     *
     * @return
     *   The component.
     **/
    inline float operator[]( int i ) const;
    /**  access to vector-elements with []-operator for manipulation
     *
     * @param i  0, 1 or 2 for x, y, z. (in)
     *
     * @return
     *   A reference to the component.
     **/
    inline float &operator[]( int i );

    /**  Assign the vector the value (t,t,t)
     *
     * @param t  The value of all three components. (in)
     **/
    inline void operator=( float t );
    /**  Assigns the value of a vector to another
     *
     * @param b  The vector to copy. (in)
     **/
    inline void operator=( const Vector3D &b );
    /**  Project a 4D-homogenous vector into 3D-space
     *
     * @param b  The homogeneous vector; w must not be 0. (in)
     **/
    inline void operator=( const Vector4D &b );

    /**  check for equality
     *
     * @param b  The other vector. (in)
     *
     * @return
     *   True if all three components are equal.
     **/
    inline bool operator==( const Vector3D &b ) const;
    /**  check for inequality
     *
     * @param b  The other vector. (in)
     *
     * @return
     *   True if any component differs.
     **/
    inline bool operator!=( const Vector3D &b ) const;

    /**  Addition of 2 vectors
     *
     * @param b  The vector to add. (in)
     *
     * @return
     *   The sum.
     **/
    inline Vector3D operator+( const Vector3D &b ) const;
    /**  Subtraction of 2 vectors
     *
     * @param b  The vector to subtract. (in)
     *
     * @return
     *   The difference.
     **/
    inline Vector3D operator-( const Vector3D &b ) const;
    /**  Negate the vector
     *
     * @return
     *   The negated vector.
     **/
    inline Vector3D operator-() const;
    /**  Adds vector b to the operand
     *
     * @param b  The vector to add. (in)
     **/
    inline void operator+=( const Vector3D &b );
    /**  Subtracts vector b from the operand
     *
     * @param b  The vector to subtract. (in)
     **/
    inline void operator-=( const Vector3D &b );

    /**  multiply a vector by a scalar
     *
     * @param r  The scale factor. (in)
     *
     * @return
     *   The scaled vector.
     **/
    inline Vector3D operator*( float r ) const;
    /**  multiply the operand by a scalar
     *
     * @param r  The scale factor. (in)
     **/
    inline void operator*=( float r );
    /**  divide a vector by a scalar
     *
     * @param r  The divisor; must not be 0. (in)
     *
     * @return
     *   The divided vector.
     **/
    inline Vector3D operator/( float r ) const;
    /**  divide the operand by a scalar
     *
     * @param r  The divisor; must not be 0. (in)
     **/
    inline void operator/=( float r );

    /**  calculate the cross-product
     *
     * @param b  The right-hand vector. (in)
     *
     * @return
     *   This vector cross b.
     **/
    inline Vector3D operator^( const Vector3D &b ) const;
    /**  calculate the cross-product
     *
     * @param b  The right-hand vector. (in)
     *
     * @return
     *   This vector cross b.
     **/
    inline Vector3D crossProd( const Vector3D &b ) const;
    /**  calculate the cross-product and assign it immediately to the operand
     *
     * @param b  The right-hand vector. (in)
     **/
    inline void operator^=( const Vector3D &b );
    /**  calculate the scalar-product
     *
     * @param b  The other vector. (in)
     *
     * @return
     *   The dot product.
     **/
    inline float operator*( const Vector3D &b ) const;
    /**  calculate the scalar-product
     *
     * @param b  The other vector. (in)
     *
     * @return
     *   The dot product.
     **/
    inline float scalarProd( const Vector3D &b ) const;

    /**  return the angle between the vector and b in radians
     *
     * @param b  The other vector; both must have unit length. (in)
     *
     * @return
     *   The angle in radians, 0..pi.
     *
     * for speed-purposes, this routine assumes, that the two vectors are normalized
     **/
    inline float angleRad( const Vector3D &b ) const;
    /**  return the angle between the vector and b in degrees
     *
     * @param b  The other vector; both must have unit length. (in)
     *
     * @return
     *   The angle in degrees, 0..180.
     *
     * for speed-purposes, this routine assumes, that the two vectors are normalized
     **/
    inline float angleDeg( const Vector3D &b ) const;

    /**  returns the squared length of the vector
     *
     * @return
     *   x*x + y*y + z*z.
     **/
    inline float sqrLength() const;
    /**  returns the length of the vector
     *
     * @return
     *   The Euclidean length.
     **/
    inline float length() const;
    /**  returns the L1-Norm of the vector (city-block-metric)
     *
     * @return
     *   |x| + |y| + |z|.
     **/
    inline float l1Norm() const;
    /**  return the index of the biggest element of the vector
     *
     * @return
     *   0, 1 or 2: the component with the largest magnitude.
     **/
    inline int indexOfGreatestElement() const;
    /**  return the value of the biggest element of the vector
     *
     * @return
     *   The component with the largest magnitude, with its sign.
     **/
    inline float greatestElement() const;
    /** Sets the length of the vector to 1, but the orientation stays the same */
    inline void normalize();
    /**  return the normalized vector as a copy
     *
     * @return
     *   The unit vector, or (0, 0, 1) for the zero vector.
     **/
    inline Vector3D normalized() const;

    /**  if the angle between the two vectors is greater than 90° flip the calling one
     *
     * @param b  The reference direction. (in)
     *
     * for speed-purposes, this routine assumes, that the two vectors are normalized
     **/
    inline void faceForward( const Vector3D &b );

    /**  Reflect the vector in place using the given normal.
     *
     * @param n  Reflection normal (assumed normalized). (in)
     **/
    inline void reflect( const Vector3D &n );
    /**  Return the reflected vector using the given normal.
     *
     * @param n  Reflection normal (assumed normalized). (in)
     *
     * @return
     *   The reflected vector; the calling vector is left unmodified.
     **/
    Vector3D reflected( const Vector3D &n ) const;

    /**  Refract the vector in place using the given normal and index of refraction.
     *
     * @param n                        Interface normal (assumed normalized). (in)
     * @param eta                      Ratio of indices of refraction (incident / transmitted medium). (in)
     * @param totalInternalReflection  Set to true if the refraction produced total internal reflection (no
     *                                 transmitted ray); in that case the vector is left unmodified. (out)
     **/
    inline void refract( const Vector3D &n, float eta, bool &totalInternalReflection );
    /**  Return the refracted vector using the given normal and index of refraction.
     *
     * @param n                        Interface normal (assumed normalized). (in)
     * @param eta                      Ratio of indices of refraction (incident / transmitted medium). (in)
     * @param totalInternalReflection  Set to true if the refraction produced total internal reflection (no
     *                                 transmitted ray); in that case the original vector is returned unchanged.
     *                                 (out)
     *
     * @return
     *   The refracted vector, or the original vector on total internal reflection.
     **/
    Vector3D refracted( const Vector3D &n, float eta, bool &totalInternalReflection ) const;

    /** cast the vector to a pointer of floats (used to load the vector to OpenGL) */
    inline explicit operator float *();
};

#include "Vector4D.h"

// ********************************
// INLINE-functions for general use
// ********************************

/**  cot of angle between two vectors
 *
 * @param a  First vector. (in)
 * @param b  Second vector; not parallel to a. (in)
 *
 * @return
 *   (a . b) / |a x b|.
 **/
inline float angleCot( const Vector3D &a, const Vector3D &b )
{
    return ( ( a * b ) / ( a ^ b ).length() );
}

/**  the absolute-value of a 3D-vector is its length
 *
 * @param v  The vector. (in)
 *
 * @return
 *   |v|.
 **/
inline float abs( const Vector3D &v )
{
    return v.length();
}

/**  The multiplication operator that allows the scalar value to preceed the vector.
 *
 * @param r  The scale factor. (in)
 * @param v  The vector. (in)
 *
 * @return
 *   The scaled vector.
 **/
inline Vector3D operator*( float r, const Vector3D &v )
{
    return v * r;
}

/**  write a 3D-vector to a stream
 *
 * @param s  The stream. (in,out)
 * @param v  The vector. (in)
 *
 * @return
 *   The stream.
 **/
inline std::ostream &operator<<( std::ostream &s, const Vector3D &v )
{
    return ( s << v.x << " " << v.y << " " << v.z );
}

/**  read a 3D-vector from a stream
 *
 * @param s  The stream. (in,out)
 * @param v  Receives the vector. (out)
 *
 * @return
 *   The stream.
 **/
inline std::istream &operator>>( std::istream &s, Vector3D &v )
{
    return ( s >> v.x >> v.y >> v.z );
}

/**  return the component wise minimum of a and b
 *
 * @param a  First vector. (in)
 * @param b  Second vector. (in)
 *
 * @return
 *   The minimum.
 **/
inline Vector3D componentMin( const Vector3D &a, const Vector3D &b )
{
    Vector3D result;
    a.x < b.x ? result.x = a.x : result.x = b.x;
    a.y < b.y ? result.y = a.y : result.y = b.y;
    a.z < b.z ? result.z = a.z : result.z = b.z;
    return result;
}

/**  return the component wise maximum of a and b
 *
 * @param a  First vector. (in)
 * @param b  Second vector. (in)
 *
 * @return
 *   The maximum.
 **/
inline Vector3D componentMax( const Vector3D &a, const Vector3D &b )
{
    Vector3D result;
    a.x > b.x ? result.x = a.x : result.x = b.x;
    a.y > b.y ? result.y = a.y : result.y = b.y;
    a.z > b.z ? result.z = a.z : result.z = b.z;
    return result;
}

/**  return the component wise multiplication of a and b
 *
 * @param a  First vector. (in)
 * @param b  Second vector. (in)
 *
 * @return
 *   The product.
 **/
inline Vector3D componentMult( const Vector3D &a, const Vector3D &b )
{
    Vector3D result;
    result.x = a.x * b.x;
    result.y = a.y * b.y;
    result.z = a.z * b.z;
    return result;
}

/**  return the component wise sqrt of a and b
 *
 * @param a  The vector; no component may be negative. (in)
 *
 * @return
 *   The square roots.
 **/
inline Vector3D componentSqrt( const Vector3D &a )
{
    Vector3D result;
    result.x = sqrt( a.x );
    result.y = sqrt( a.y );
    result.z = sqrt( a.z );
    return result;
}

// *****************************
// INLINE-functions for Vector3D
// *****************************
inline float Vector3D::operator[]( int i ) const
{
    assert( ( i >= 0 ) && ( i < 3 ) );
    return ( &x )[i];
}

inline float &Vector3D::operator[]( int i )
{
    assert( ( i >= 0 ) && ( i < 3 ) );
    return ( &x )[i];
}

inline void Vector3D::operator=( float t )
{
    x = y = z = t;
}

inline void Vector3D::operator=( const Vector3D &b )
{
    x = b.x;
    y = b.y;
    z = b.z;
}

inline void Vector3D::operator=( const Vector4D &b )
{
    x = b.x / b.w;
    y = b.y / b.w;
    z = b.z / b.w;
}

inline bool Vector3D::operator==( const Vector3D &b ) const
{
    return ( x == b.x && y == b.y && z == b.z );
}

inline bool Vector3D::operator!=( const Vector3D &b ) const
{
    return ( x != b.x || y != b.y || z != b.z );
}

inline Vector3D Vector3D::operator+( const Vector3D &b ) const
{
    return Vector3D( x + b.x, y + b.y, z + b.z );
}

inline Vector3D Vector3D::operator-( const Vector3D &b ) const
{
    return Vector3D( x - b.x, y - b.y, z - b.z );
}

inline Vector3D Vector3D::operator-() const
{
    return Vector3D( -x, -y, -z );
}

inline void Vector3D::operator+=( const Vector3D &b )
{
    x += b.x;
    y += b.y;
    z += b.z;
}

inline void Vector3D::operator-=( const Vector3D &b )
{
    x -= b.x;
    y -= b.y;
    z -= b.z;
}

inline Vector3D Vector3D::operator*( float r ) const
{
    return Vector3D( r * x, r * y, r * z );
}

inline void Vector3D::operator*=( float r )
{
    x *= r;
    y *= r;
    z *= r;
}

inline Vector3D Vector3D::operator/( float r ) const
{
    assert( r != 0.0 );
    return Vector3D( x / r, y / r, z / r );
}

inline void Vector3D::operator/=( float r )
{
    assert( r != 0.0 );
    x /= r;
    y /= r;
    z /= r;
}

inline Vector3D Vector3D::operator^( const Vector3D &b ) const
{
    return crossProd( b );
}

inline Vector3D Vector3D::crossProd( const Vector3D &b ) const
{
    return Vector3D( y * b.z - b.y * z,
                     z * b.x - b.z * x,
                     x * b.y - b.x * y );
}

inline void Vector3D::operator^=( const Vector3D &b )
{
    *this = ( *this ) ^ b;
}

inline float Vector3D::operator*( const Vector3D &b ) const
{
    return scalarProd( b );
}

inline float Vector3D::scalarProd( const Vector3D &b ) const
{
    return ( x * b.x + y * b.y + z * b.z );
}

inline float Vector3D::angleRad( const Vector3D &b ) const
{
    return acos( this->scalarProd( b ) );
}

inline float Vector3D::angleDeg( const Vector3D &b ) const
{
    return angleRad( b ) * 180.0f / M_PI;
}

inline float Vector3D::sqrLength() const
{
    return x * x + y * y + z * z;
}

inline float Vector3D::length() const
{
    return sqrt( sqrLength() );
}

inline float Vector3D::l1Norm() const
{
    return fabs( x ) + fabs( y ) + fabs( z );
}

inline int Vector3D::indexOfGreatestElement() const
{
    float ax = fabs( x );
    float ay = fabs( y );
    float az = fabs( z );
    return ( ax < ay ) ? ( ( ay < az ) ? 2 : 1 ) : ( ( ax < az ) ? 2 : 0 );
}

inline float Vector3D::greatestElement() const
{
    return ( &x )[indexOfGreatestElement()];
}

inline void Vector3D::normalize()
{
    float this_length = length();
    if ( this_length != 0 )
        *this /= this_length;
    else
    {
        x = 0;
        y = 0;
        z = 1;
    }
}

inline Vector3D Vector3D::normalized() const
{
    float this_length = length();
    if ( this_length != 0 )
        return Vector3D( x / this_length, y / this_length, z / this_length );
    else
        return Vector3D( 0, 0, 1 );
}

inline void Vector3D::faceForward( const Vector3D &b )
{
    if ( ( *this ) * b < 0 )
    {
        // flip this
        x = -x;
        y = -y;
        z = -z;
    }
}

inline void Vector3D::reflect( const Vector3D &n )
{
    ( *this ) = reflected( n );
}

inline void Vector3D::refract( const Vector3D &n, float eta, bool &totalInternalReflection )
{
    ( *this ) = refracted( n, eta, totalInternalReflection );
}

inline Vector3D::operator float *()
{
    return &x;
}


#endif
