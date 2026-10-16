#version 330 core
/*****************************************************************************\
 *                              HyperbolicEscherCircleLimit.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  HYPERBOLIC ESCHER CIRCLE LIMIT: Conformal Poincaré disk tessellation with infinite tile density toward the
 *  boundary and dynamic Möbius inversions.
 *
 *  Fills the screen with breathing non-Euclidean hyperbolic symmetries.
 *
 *  Audio Reactivity:
 *    audioAdvance -> continuous rotation & hyperbolic space translation
 *    audioKick    -> inward/outward inversion shockwave
 *    audioSubBass -> pulses the hyperbolic curvature & boundary breathing
 *    audioCentroid-> modulates tile complexity & spectral edge highlights
 *    audioChromaHue-> rotates the generative and texture-driven palette
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).

uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioPhase;     ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                              ///< backwards).
uniform float audioSwell;     ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;     ///< Overall loudness, 0..1.
uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioCentroid;  ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioSubBass;   ///< Sub-bass band level, 0..1.
uniform float audioBass;      ///< Bass band level, 0..1.
uniform float audioMid;       ///< Mid band level, 0..1.
uniform float audioHigh;      ///< High band level, 0..1.
uniform float audioFlux;      ///< Spectral flux (how fast the spectrum changes), 0..1.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

// Per-activation variety
uniform float speedP;  ///< Speed knob, 0..1.
uniform float pSidesP; ///< e.g. 5, 7 or 8-fold hyperbolic symmetry
uniform float curveP;  ///< Curve knob, 0.8..1.4.
uniform float glowP;   ///< Glow / afterglow knob, 0..1.
uniform float hueP;    ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

/**  The photo at a coordinate: the cross-fade of tex0 and tex1.
 *
 * @param uv  Coordinate in the photo, 0..1. (in)
 *
 * @return
 *   The cross-faded photo colour (RGB).
 **/
vec3 img( vec2 uv )
{
    return ( interpolation * texture( tex0, uv ) + ( 1.0 - interpolation ) * texture( tex1, uv ) ).rgb;
}

/**  The house palette: a colour of the photo on an arc that turns with the music's hue.
 *
 * @param t  Position on the palette arc, 0..1 for one turn. (in)
 *
 * @return
 *   The palette colour (RGB).
 **/
vec3 imgPalette( float t )
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853 + hueP;
    float rad = 0.16 + 0.08 * sin( audioAdvance * 0.013 );
    vec3  pc = img( clamp( vec2( 0.5 ) + rad * vec2( cos( ang ), sin( ang ) ), 0.0, 1.0 ) );
    float pg = dot( pc, vec3( 0.333 ) );
    return mix( vec3( pg ), pc, 0.55 + 0.45 * audioValence );
}

/**  Rotates a colour's hue by an angle (about the grey axis).
 *
 * @param c  The colour. (in)
 * @param a  The angle in radians. (in)
 *
 * @return
 *   The colour with its hue turned.
 **/
vec3 hueRot( vec3 c, float a )
{
    vec3  k = vec3( 0.57735026919 );
    float cs = cos( a ), sn = sin( a );
    return c * cs + cross( k, c ) * sn + k * dot( k, c ) * ( 1.0 - cs );
}

/**  Complex arithmetic helpers
 *
 * @param a  One complex number. (in)
 * @param b  The other. (in)
 *
 * @return
 *   The product a b.
 **/
vec2 cMul( vec2 a, vec2 b )
{
    return vec2( a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x );
}
/**  Complex division
 *
 * @param a  The numerator. (in)
 * @param b  The denominator. (in)
 *
 * @return
 *   The quotient a / b.
 **/
vec2 cDiv( vec2 a, vec2 b )
{
    return vec2( dot( a, b ), a.y * b.x - a.x * b.y ) / dot( b, b );
}
/**  Complex inverse.
 *
 * @param z  The complex number. (in)
 *
 * @return
 *   1 / z.
 **/
vec2 cInv( vec2 z )
{
    return vec2( z.x, -z.y ) / dot( z, z );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution.xy ) / min( resolution.x, resolution.y );

    float spd = ( speedP > 0.01 ) ? speedP : 1.0;
    float crv = ( curveP > 0.01 ) ? curveP : 1.0;
    float glw = ( glowP > 0.01 ) ? glowP : 1.0;
    float sides = ( pSidesP > 1.0 ) ? pSidesP : 7.0;

    // Hyperbolic space drift & translation
    float t = time * 0.180 * spd + audioAdvance * 0.180 * spd;
    // Time base + music push: audioAdvance ALONE stands still in quiet
    // music (the reported "looks like a still picture" class).
    float rot_angle = t * 0.15 + audioPhase * 0.1;
    float cs = cos( rot_angle ), sn = sin( rot_angle );
    vec2  z = mat2( cs, -sn, sn, cs ) * uv * ( 1.45 + 0.15 * sin( audioSwell * 2.0 ) );

    // Möbius translation: z -> (z - a) / (1 - conj(a)*z)
    vec2 a_mob = 0.45 * vec2( sin( t * 0.4 ), cos( t * 0.31 ) ) * ( 0.8 + 0.4 * audioSubBass );
    z = cDiv( z - a_mob, vec2( 1.0, 0.0 ) - cMul( vec2( a_mob.x, -a_mob.y ), z ) );

    // Fullscreen seamless tiling via repeated circle inversions
    float fold_count = 0.0;
    float min_edge_dist = 1e5;
    float seg_angle = 3.14159265 / sides;

    for ( int i = 0; i < 9; ++i )
    {
        // Fold across radial mirror planes
        float ang = atan( z.y, z.x );
        float r = length( z );
        ang = mod( ang + seg_angle, 2.0 * seg_angle ) - seg_angle;
        ang = abs( ang );
        z = vec2( cos( ang ), sin( ang ) ) * r;

        // Hyperbolic circle mirror inversion (circle centered at (xc, 0) with radius rc)
        float xc = cos( seg_angle ) / sin( seg_angle ); // characteristic circle center
        float rc = sqrt( max( 0.01, xc * xc - 1.0 ) ) * crv;
        vec2  center = vec2( xc, 0.0 );
        vec2  diff = z - center;
        float d2 = dot( diff, diff );

        if ( d2 < rc * rc )
        {
            z = center + diff * ( rc * rc / max( 0.0001, d2 ) );
            fold_count += 1.0;
        }

        min_edge_dist = min( min_edge_dist, abs( length( diff ) - rc ) );
        min_edge_dist = min( min_edge_dist, abs( z.y ) );
    }

    // Dynamic texture lookup mapped on the folded hyperbolic domain
    vec2 sample_uv = fract( z * 0.5 + 0.5 );
    vec3 tex_sample = img( sample_uv );

    // Color generation based on iteration depth and edge glow
    float pattern = sin( z.x * 12.0 + t ) * cos( z.y * 12.0 - t );
    float glow = exp( -min_edge_dist * ( 35.0 + 15.0 * audioCentroid ) ) * glw * ( 1.0 + 2.0 * audioKick );

    vec3 col_a = imgPalette( fold_count * 0.12 + pattern * 0.08 );
    vec3 col_b = imgPalette( fold_count * 0.12 + 0.5 );
    vec3 col = mix( col_a, col_b, 0.5 + 0.5 * pattern );

    col += vec3( 1.2, 0.9, 1.5 ) * glow;
    col = mix( col, tex_sample, 0.35 + 0.15 * audioValence );

    // Chromatic aberration at high energy
    float ca = 0.015 * ( audioKick + audioFlux );
    vec3  col_r = imgPalette( fold_count * 0.12 + ca );
    vec3  col_b2 = imgPalette( fold_count * 0.12 - ca );
    col.r = mix( col.r, col_r.r, 0.4 );
    col.b = mix( col.b, col_b2.b, 0.4 );

    // Edge vignette & tone mapping
    float vig = 1.0 - smoothstep( 0.8, 1.4, length( uv ) );
    col *= vig;
    col = pow( col, vec3( 0.85 ) );

    fragColor = vec4( col, 1.0 );
}
