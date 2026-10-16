#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file FxWater.frag
 * @brief FX WATER: multi-directional ripple interference pattern refracts and
 * specular-highlights the scene like light through a rippling water surface.
 */
uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.
uniform float     audioAdvance;  ///< integrated music energy: ripples speed up smoothly
uniform float     audioBeat;     ///< Beat envelope, 0..1.




const float Pi = 3.1415926535897932; ///< Pi.

// play with these parameters to custimize the effect
// ===================================================

// speed
const float Speed = 0.1;   ///< 0.2;
const float SpeedX = 0.01; ///< 0.3;
const float SpeedY = 0.01; ///< 0.3;

// refraction
const float Emboss = 0.50;
const float Intensity = 2.4;
const int   Steps = 4; ///< 8;
const float Frequency = 6.0;
const int   Angle = 7; ///< better when a prime

// reflection
const float Delta = 120.0;   ///< 60.;
const float Intence = 120.0; ///< 700.;

const float ReflectionCutOff = 0.012;
const float ReflectionIntence = 200000.;

// ===================================================


/**  Caustic brightness at a coordinate: waves from several angles.
 *
 * @param coord  The coordinate. (in)
 *
 * @return
 *   The brightness.
 **/
float col( vec2 coord )
{
    float delta_theta = 2.0 * Pi / float( Angle );
    float col = 0.0;
    float theta = 0.0;
    for ( int i = 0; i < Steps; ++i )
    {
        vec2 adjc = coord;
        theta = delta_theta * float( i );
        float tw = time + 0.6 * audioAdvance;
        adjc.x += cos( theta ) * tw * Speed + tw * SpeedX;
        adjc.y -= sin( theta ) * tw * Speed - tw * SpeedY;
        col = col + cos( ( adjc.x * cos( theta ) - adjc.y * sin( theta ) ) * Frequency ) * Intensity;
    }

    return cos( col );
}

//---------- main

/** Entry point of this shader stage (the file description says what it draws). */
void main( void )
{
    vec2  p = ( gl_FragCoord.xy ) / resolution.xy, c1 = p, c2 = p;
    float cc1 = col( c1 );

    c2.x += resolution.x / Delta;
    float dx = Emboss * ( cc1 - col( c2 ) ) / Delta;

    c2.x = p.x;
    c2.y += resolution.y / Delta;
    float dy = Emboss * ( cc1 - col( c2 ) ) / Delta;

    c1.x += dx * 2.;
    c1.y = -( c1.y + dy * 2. );

    float alpha = 1. + dot( dx, dy ) * Intence;

    float ddx = dx - ReflectionCutOff;
    float ddy = dy - ReflectionCutOff;
    if ( ddx > 0. && ddy > 0. )
        alpha = pow( alpha, ddx * ddy * ReflectionIntence );

    vec4 col = interpolation * texture( tex0, c1 ) + ( 1.0 - interpolation ) * texture( tex1, c1 );
    col *= alpha;
    // vec4 col = texture(iChannel0,c1)*(alpha);
    fragColor = col;
}
