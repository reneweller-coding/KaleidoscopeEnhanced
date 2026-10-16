#version 330 core
/*****************************************************************************\
 *                              FxLens.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  FX LENS: four orbiting refractive lens bubbles bend the scene through a spherical-cap refraction model, like
 *  magnifying glasses drifting around the frame in a slow circle.
 *
 *  @author René Weller
 */
out vec4          fragColor;     ///< The pixel's colour (output).
uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.
uniform float     audioAdvance;  ///< music drives the lens orbit
uniform float     audioSwell;    ///< Slow loudness envelope, 0..1 (seconds).


// vec2 getModifiedUV(vec2 actualUV, vec2 pointUV, float radius, float strength)
//{
//	vec2 vecToPoint = pointUV - actualUV;
//	float distToPoint = length(vecToPoint);

//	float mag = (1.0 - (distToPoint / radius)) * strength;
//	mag *= step(distToPoint, radius);

//	if( mag != 0 )//rwrwtest
//	return (0,0);//rwrwtest

//	return actualUV + (mag * vecToPoint);
//}

/// Pi.
#define PI 3.141592653589793238462643383279

/**  Four-quadrant arc tangent.
 *
 * @param y  The y component. (in)
 * @param x  The x component. (in)
 *
 * @return
 *   The angle in radians.
 **/
float atan2( float y, float x )
{
    if ( x > 0. )
        return atan( y / x );
    if ( y >= 0. && x < 0. )
        return atan( y / x ) + PI;
    if ( y < 0. && x < 0. )
        return atan( y / x ) - PI;
    if ( y > 0. && x == 0. )
        return PI / 2.;
    if ( y < 0. && x == 0. )
        return -PI / 2.;
    if ( y == 0. && x == 0. )
        return PI / 2.; // undefined usually
    return PI / 2.;
}

/**  Polar coordinates of a point about a centre.
 *
 * @param uv      The point. (in)
 * @param center  The centre. (in)
 *
 * @return
 *   (angle, radius).
 **/
vec2 uvPolar( vec2 uv, vec2 center )
{
    vec2  c = uv - center;
    float rad = length( c );
    float ang = atan2( c.x, c.y );
    return vec2( ang, rad );
}

/**  A coordinate refracted through a glass half-sphere.
 *
 * @param uv            The coordinate. (in)
 * @param position      Centre of the lens. (in)
 * @param radius        Radius of the lens. (in)
 * @param refractivity  Strength of the refraction. (in)
 *
 * @return
 *   The refracted coordinate.
 **/
vec2 getModifiedUV( vec2 uv, vec2 position, float radius, float refractivity )
{
    vec2  polar = uvPolar( uv, position );
    float cone = clamp( 1. - polar.y / radius, 0., 1. );
    float halfsphere = sqrt( 1. - pow( cone - 1., 2. ) );
    float w = atan2( 1. - cone, halfsphere );
    float refrac_w = w - asin( sin( w ) / refractivity );
    float refrac_d = 1. - cone - sin( refrac_w ) * halfsphere / cos( refrac_w );
    vec2  refrac_uv = position + vec2( sin( polar.x ), cos( polar.x ) ) * refrac_d * radius;
    return mix( uv, refrac_uv, float( length( uv - position ) < radius ) );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main( void )
{
    const float radius = 0.15;
    float       strength = 115.9;

    float min_res = min( resolution.x, resolution.y );
    vec2  uv1 = gl_FragCoord.xy / resolution.xy;

    float offset = 0.3;

    float speed = 0.4;
    float orb_a = speed * time + 0.20 * audioAdvance;
    vec2  cst = vec2( cos( orb_a ), sin( orb_a ) );
    mat2  rot = mat2( cst.x, -cst.y, cst.y, cst.x );

    vec2 pos1 = vec2( 0.0, offset );
    pos1 = rot * pos1;
    pos1 += vec2( 0.5, 0.5 );
    vec2 modified_uv1 = getModifiedUV(
        uv1,
        pos1,
        radius,
        strength );

    vec2 pos2 = vec2( 0.0, -offset );
    pos2 = rot * pos2;
    pos2 += vec2( 0.5, 0.5 );

    vec2 modified_uv2 = getModifiedUV(
        uv1,
        pos2,
        radius,
        strength );


    vec2 pos3 = vec2( offset, 0.0 );
    pos3 = rot * pos3;
    pos3 += vec2( 0.5, 0.5 );

    vec2 modified_uv3 = getModifiedUV(
        uv1,
        pos3,
        radius,
        strength );

    vec2 pos4 = vec2( -offset, 0.0 );
    pos4 = rot * pos4;
    pos4 += vec2( 0.5, 0.5 );

    vec2 modified_uv4 = getModifiedUV(
        uv1,
        pos4,
        radius,
        strength );

    vec2 uv = 0.25 * ( modified_uv1 + modified_uv2 + modified_uv3 + modified_uv4 );

    fragColor = interpolation * texture( tex0, uv ) + ( 1.0 - interpolation ) * texture( tex1, uv );
}
