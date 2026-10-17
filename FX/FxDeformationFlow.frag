#version 330 core
/*****************************************************************************\
 *                              FxDeformationFlow.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Polar radial-flow warp (Inigo Quilez, iq/2013): unwraps the scene into polar coordinates around a moving point
 *  pair and scrolls it, tiled into "copies" mirrored repeats; an optional grid overlay shows the seams.
 *
 *  @author René Weller; contains code by Inigo Quilez (iq, 2013, CC BY-NC-SA 3.0)
 */
out vec4          fragColor;         ///< The pixel's colour (output).
uniform vec2      resolution;        ///< Size of the render target in pixels.
uniform float     time;              ///< Seconds since this activation, plus a rolled start (see sceneTime).
uniform sampler2D tex0;              ///< The current photo.
uniform sampler2D tex1;              ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation;     ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.
uniform float     audioAdvance;      ///< music advances the flow
uniform float     audioBeat;         ///< Beat envelope, 0..1.
uniform float     copies;            ///< Copies per side of the tile grid.
uniform int       displayGrid;       ///< 1: show the deformation grid.
uniform float     speed;             ///< Speed of the motion.
uniform int       directionPositive; ///< 1: the flow runs the positive way.
uniform int       leftRight;         ///< 1: the flow runs left-right instead of up-down.

// void main() {

// normalize to the center
//	vec2 p;
//  p.x = gl_FragCoord.x;
//  p.y = gl_FragCoord.y;
//	p.x /= resolution.x;
//	p.y /= resolution.y;

//  fragColor = ;

//}


// Created by inigo quilez - iq/2013
// License Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License.


const float Scaletexture = 2.0; ///< 2.0

/** Entry point of this shader stage (the file description says what it draws). */
void main( void )
{
    vec2 p = gl_FragCoord.xy;
    p.x /= resolution.x;
    p.y /= resolution.y;
    // p.x -= 0.5*resolution.x/resolution.y;
    // p.y -= 0.5;
    p *= Scaletexture;
    p -= 1.0;

    float speedl = speed;

    if ( directionPositive > 0 )
        speedl = -speedl;


    vec2 center;
    center.x = gl_FragCoord.x;
    center.y = gl_FragCoord.y;
    center.x /= resolution.x;
    center.y /= resolution.y;
    // center.x -= 0.5;//*resolution.x/resolution.y;
    // center.y -= 0.5;

    float y_pos = 0.0;
    if ( leftRight > 0 )
        y_pos = 1.0;


    vec2 mouse = vec2( 0.0, y_pos ); // center;
    // vec2 mouse = vec2( 0.15, 0.15 );//center;


    // vec2 m = -1.0 + scaletexture * mouse.xy;// / resolution.xy;
    vec2 m = -1.0 + Scaletexture * mouse.xy; // / resolution.xy;


    // mouse = vec2( 0.0, 0.0 );
    // p = -1.0 + 2.0 * gl_FragCoord.xy / iResolution.xy;
    // m = -1.0 + 2.0 * iMouse.xy / iResolution.xy;


    float a1 = atan( p.y - m.y, p.x - m.x );
    float r1 = sqrt( dot( p - m, p - m ) );
    float a2 = atan( p.y + m.y, p.x + m.x );
    float r2 = sqrt( dot( p + m, p + m ) );

    vec2 uv;
    uv.x = speedl * ( time + 0.5 * audioAdvance ) + ( r1 - r2 ) * 0.25;
    uv.y = asin( sin( a1 - a2 ) ) / 3.1416;


    vec2 uv1;
    uv1.x = copies * uv.x;
    uv1.y = copies * uv.y;


    int vorkomma = int( floor( uv1.x ) );

    float nachkomma = fract( uv1.x );

    // scale
    nachkomma *= resolution.y / resolution.x;
    nachkomma += 0.5 * ( resolution.x - resolution.y ) / resolution.x;

    if ( vorkomma - ( vorkomma / 2 ) * 2 == 0 )
        uv1.x = 1.0 - nachkomma;
    else
        uv1.x = nachkomma;



    // vec3 col = texture( iChannel0, 0.125*uv ).zyx;

    // uv.x *= resolution.x/resolution.y;
    vec3 col = ( interpolation * texture( tex0, uv1 ) + ( 1.0 - interpolation ) * texture( tex1, uv1 ) ).xyz;

    float w = ( exp( -15.0 * r1 * r1 ) + exp( -15.0 * r2 * r2 ) ) * ( 1.0 + 0.4 * audioBeat );

    if ( displayGrid > 0 )
    {
        w += 0.25 * smoothstep( 0.93, 1.0, sin( 32.0 * uv.x * copies ) );
        w += 0.25 * smoothstep( 0.93, 1.0, sin( 32.0 * uv.y * copies ) );
    }

    fragColor = vec4( col + w, 1.0 );
}
