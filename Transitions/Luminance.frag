#version 330 core
/*****************************************************************************\
 *                              Luminance.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Luminance-ordered dissolve: dark areas give way to the new scene first, highlights last.
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

/**  The mean brightness of a scene, estimated from nine fixed points.
 *
 * @param s  The scene's texture. (in)
 *
 * @return
 *   The mean luminance, 0..1.
 **/
float meanLuma( sampler2D s )
{
    float sum = 0.0;
    for ( int j = 0; j < 3; ++j )
        for ( int i = 0; i < 3; ++i )
            sum += dot( texture( s, ( vec2( float( i ), float( j ) ) + 0.5 ) / 3.0 ).rgb, vec3( 0.299, 0.587, 0.114 ) );
    return sum / 9.0;
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2  p = gl_FragCoord.xy / resolution;
    float d = clamp( 1.0 - interpolation, 0.0, 1.0 ); // transition progress 0..1
    // No beat surge any more: pushing the progress forward on every beat
    // made the geometry jump in time with the music (speed pass 14.09.2026).

    vec4  c0 = texture( tex0, p );
    vec4  c1 = texture( tex1, p );
    float key = dot( c0.rgb, vec3( 0.299, 0.587, 0.114 ) ) * 0.7
                + dot( c1.rgb, vec3( 0.299, 0.587, 0.114 ) ) * 0.3;
    // The order is taken around the scenes' own mean brightness and stretched: a dark pair of scenes has all of its
    // keys in a narrow band, and the whole picture used to switch in a quarter of the fade (measured: 80 % of the
    // change in 30 % of it).
    float mean_key = meanLuma( tex0 ) * 0.7 + meanLuma( tex1 ) * 0.3;
    key = smoothstep( 0.0, 1.0, clamp( 0.5 + 1.7 * ( key - mean_key ), 0.0, 1.0 ) );
    float w = smoothstep( key - 0.25, key + 0.25, d * 1.5 - 0.25 );
    fragColor = blend4( c0, c1, w );
}
