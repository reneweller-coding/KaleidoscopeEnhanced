#version 330 core
/*****************************************************************************\
 *                              StereoMix.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Plain per-pixel cross-mix used ONLY for TRUE-STEREO scene cross-fades: the output is an eye-packed SBS/TB frame,
 *  so the blend must never move a pixel across the eye boundary (any warp would fold content into the other eye).
 *
 *  interpolation = 1 -> texA (the active scene), 0 -> texB (the incoming one) — the same weighting every combine
 *  style honours at its endpoints.
 *
 *  Each input is either eye-packed already (a 3D scene rendered once per eye) or, since 20.11.2026, a mono 2D scene
 *  (monoA / monoB): the other side of a fade between a 3D and a 2D scene.  A mono input gets its two eyes here,
 *  shifted by the depth the present pass gives a 2D picture (Present.frag, stereoDepthAt(): brightness forward, the
 *  centre back, stereoDepth * 0.007 * (depth - 0.45) of the eye's width per eye) -- so the 3D scene keeps its real
 *  depth through the whole fade instead of collapsing to the picture's at its first frame (measured before: a card 8
 *  units away jumped from 4.5 % of the eye's width in front of the screen to 0.4 % behind it).  The present pass's
 *  own depth cue is its bloom buffer, which does not exist yet at this point: a bright pass over a small blur of the
 *  mono input stands in for it (threshold 0.70, x1.6, as the bloom's).
 *
 *  @author René Weller
 */
out vec4          fragColor;     ///< The pixel's colour (output).
uniform sampler2D texA;          ///< The first input of a fade.
uniform sampler2D texB;          ///< The second input of a fade.
uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.
uniform int       monoA;         ///< 1: texA is one mono frame, not eye-packed.
uniform int       monoB;         ///< 1: texB is one mono frame, not eye-packed.
uniform int       eyeLayout;     ///< The packing: 1 side by side (left eye left), 2 top-bottom (left eye on top).
uniform float     stereoDepth;   ///< The disparity strength, 0..2 (as in the present pass).

/**  The pseudo-depth of a mono picture at a point (Present.frag, stereoDepthAt(), with a stand-in for its bloom).
 *
 * @param t    The mono picture. (in)
 * @param luv  The point, in the frame's coordinates. (in)
 *
 * @return
 *   The depth, 0..1 (0.45 is the screen's plane).
 **/
float monoDepth( sampler2D t, vec2 luv )
{
    vec3 s = vec3( 0.0 );
    for ( int j = -1; j <= 1; ++j )
        for ( int i = -1; i <= 1; ++i )
            s += max( texture( t, luv + vec2( float( i ), float( j ) ) * 0.008 ).rgb - 0.70, vec3( 0.0 ) ) * 1.6;
    float bl = dot( s / 9.0, vec3( 0.299, 0.587, 0.114 ) );
    return clamp( bl * 1.4, 0.0, 1.0 ) * 0.7 + clamp( length( luv - 0.5 ) * 1.5, 0.0, 1.0 ) * 0.3;
}

/**  One input at this pixel of the packed output.
 *
 * @param t         The input. (in)
 * @param mono      Whether it is a mono frame. (in)
 * @param uv        The pixel in the packed output. (in)
 * @param luv       The same pixel in the frame of its eye. (in)
 * @param eye_sign  -1 left eye, +1 right eye. (in)
 *
 * @return
 *   The colour.
 **/
vec3 eyeSample( sampler2D t, int mono, vec2 uv, vec2 luv, float eye_sign )
{
    if ( mono == 0 )
        return texture( t, uv ).rgb;
    vec2 p = luv;
    p.x += stereoDepth * 0.007 * ( monoDepth( t, luv ) - 0.45 ) * eye_sign;
    return texture( t, p ).rgb;
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2  uv = gl_FragCoord.xy / resolution;
    vec2  luv = uv;
    float eye_sign = 0.0;
    if ( eyeLayout == 1 )
    {
        eye_sign = ( uv.x < 0.5 ) ? -1.0 : 1.0;
        luv.x = fract( uv.x * 2.0 );
    }
    else if ( eyeLayout == 2 )
    {
        eye_sign = ( uv.y >= 0.5 ) ? -1.0 : 1.0; // top half = left eye
        luv.y = fract( uv.y * 2.0 );
    }
    vec3 a = eyeSample( texA, monoA, uv, luv, eye_sign );
    vec3 b = eyeSample( texB, monoB, uv, luv, eye_sign );
    fragColor = vec4( mix( b, a, interpolation ), 1.0 );
}
