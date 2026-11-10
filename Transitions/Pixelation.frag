#version 330 core
/*****************************************************************************\
 *                              Pixelation.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Pixelation morph: the frame coarsens into blocks, swaps scenes, and sharpens back.
 *
 *  Scene TRANSITION shader (Transitions/): blends the outgoing scene
 *  (tex0) into the incoming one (tex1) over one cross-fade.
 *  interpolation: 1 = old scene fully visible .. 0 = new scene.
 *  Extracted from the former FxPlain.frag 28-style library.
 *
 *  @author René Weller
 */
out vec4          fragColor;     ///< The pixel's colour (output).
uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.


const float Pi = 3.14159265358979; ///< Pi.

/**  Mixes two RGBA values with a clamped weight.
 *
 * @param a  The value at weight 0. (in)
 * @param b  The value at weight 1. (in)
 * @param w  The weight; clamped to 0..1. (in)
 *
 * @return
 *   The mixed value.
 **/
vec4 blend4( vec4 a, vec4 b, float w )
{
    return mix( a, b, clamp( w, 0.0, 1.0 ) );
}

/**  The progress, re-timed so that the change is spread evenly over the fade (knots measured by
 * Tools/transition_warp.py; a monotone cubic through them, identity at 0 and 1).
 *
 * @param d  The progress, 0..1. (in)
 *
 * @return
 *   The re-timed progress, 0..1.
 **/
float evenProgress( float d )
{
    const float K[17] = float[17]( 0.0000, 0.2692, 0.3483, 0.3932, 0.4246, 0.4493, 0.4707, 0.4917, 0.5115, 0.5314,
                                   0.5516, 0.5739, 0.5999, 0.6337, 0.6807, 0.7609, 1.0000 );
    float       x = clamp( d, 0.0, 1.0 ) * 16.0;
    int         i = int( min( floor( x ), 15.0 ) );
    float       f = x - float( i );
    float       p0 = K[i];
    float       p1 = K[i + 1];
    float       pm = K[max( i - 1, 0 )];
    float       pn = K[min( i + 2, 16 )];
    float       dl = p1 - p0;
    // Tangents limited to three times the flatter neighbouring slope: the curve never runs backwards.
    float m0 = ( i == 0 ) ? dl : min( 0.5 * ( p1 - pm ), 3.0 * min( dl, p0 - pm ) );
    float m1 = ( i == 15 ) ? dl : min( 0.5 * ( pn - p0 ), 3.0 * min( dl, pn - p1 ) );
    float f2 = f * f;
    float f3 = f2 * f;
    return ( 2.0 * f3 - 3.0 * f2 + 1.0 ) * p0 + ( f3 - 2.0 * f2 + f ) * m0 + ( 3.0 * f2 - 2.0 * f3 ) * p1
           + ( f3 - f2 ) * m1;
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2  p = gl_FragCoord.xy / resolution;
    float d = evenProgress( clamp( 1.0 - interpolation, 0.0, 1.0 ) ); // transition progress 0..1
    // No beat surge any more: pushing the progress forward on every beat
    // made the geometry jump in time with the music (speed pass 14.09.2026).
    float mid = sin( Pi * d ); // 0 at both ends, 1 mid-transition
    // No envelope on mid here: the block size below is quantised, so any change
    // at a held progress stepped the whole grid (speed pass 14.09.2026).
    float aspect = resolution.x / resolution.y;
    vec2  p0 = p, p1 = p; // sample coords old / new
    float w1 = d;         // weight of the NEW scene
    float dark = 1.0;     // optional dip factor

    // Starts near-identity (900 cells) and EASES into the blocks - the
    // old 220-cell start popped visible blockiness in at d=0 and out
    // again at d=1 (a hard step at both ends of the fade).
    float cells = mix( 900.0, 16.0, mid );
    vec2  grid = vec2( cells, cells / aspect );
    vec2  pq = ( floor( p * grid ) + 0.5 ) / grid;
    vec2  pm = mix( p, pq, smoothstep( 0.0, 0.12, mid ) );
    p0 = pm;
    p1 = pm;

    vec4 c0 = texture( tex0, p0 );
    vec4 c1 = texture( tex1, p1 );
    fragColor = blend4( c0, c1, w1 ) * dark;
}
