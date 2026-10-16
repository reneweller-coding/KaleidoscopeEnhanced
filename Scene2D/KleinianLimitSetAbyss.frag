#version 330 core
/*****************************************************************************\
 *                              KleinianLimitSetAbyss.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  KLEINIAN LIMIT SET ABYSS: Iterated Schottky & Maskit-slice Kleinian group limit sets (Indra's Pearls).
 *
 *  Infinite fractal kissing pearl circles, deep zoom into parabolic tangency cusps, and dynamic complex moduli
 *  morphing.
 *
 *  Audio Reactivity:
 *    audioAdvance -> navigates through complex moduli space & deep cusp zoom
 *    audioKick    -> flashes cusp tangency nodes & explodes circle boundaries
 *    audioCentroid-> increases iteration depth & edge detail
 *    audioSubBass -> expands circle radius breathing
 *    audioChromaHue-> rotates the iridescent pearl spectrum
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
uniform float zoomP;   ///< Zoom knob, 0..1.
uniform float moduliP; ///< Moduli knob, 0.8..1.4.
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

/**  Complex helper functions
 *
 * @param z  The complex number. (in)
 *
 * @return
 *   1 / z.
 **/
vec2 cInv( vec2 z )
{
    return vec2( z.x, -z.y ) / max( 0.0001, dot( z, z ) );
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

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution.xy ) / min( resolution.x, resolution.y );

    float spd = ( speedP > 0.01 ) ? speedP : 1.0;
    float zm = ( zoomP > 0.01 ) ? zoomP : 1.0;
    float mod_param = ( moduliP > 0.01 ) ? moduliP : 1.0;
    float glw = ( glowP > 0.01 ) ? glowP : 1.0;

    float t = time * 0.25 * spd + audioAdvance * 0.20 * spd; // Zeit-Basis:
    // audioAdvance alone stands still in quiet music ("looks like a still picture").

    // Deep zoom into the Kleinian cusp, ping-ponged. The old
    // exp(mod(t * 0.6, 6.0)) snapped from e^6 (403x) back to e^0 every ~10 s
    // -- a hard cut. A raised cosine over the same period dives in and eases
    // back out instead: continuous in value AND velocity (the derivative
    // vanishes at both turns), so no seam anywhere.
    float zc = 0.5 - 0.5 * cos( 6.2831853 * fract( t * 0.6 / 6.0 ) ); // 0..1..0
    // Zoom capped (at most ~9x instead of 403x): deep in the set only the
    // border line was left -- "two flat-coloured areas".
    float zoom_level = exp( zc * 2.2 ) * zm;
    vec2  z = uv / zoom_level;

    // Moduli parameter mu for Maskit slice: mu = (mu_r, mu_i)
    vec2 mu = vec2(
        1.95 + 0.15 * sin( t * 0.3 ) * mod_param,
        0.08 + 0.12 * cos( t * 0.24 ) * ( 1.0 + 0.2 * audioSwell ) );

    // Initial translation and rotation
    float rot_a = t * 0.15;
    float cs = cos( rot_a ), sn = sin( rot_a );
    z = mat2( cs, -sn, sn, cs ) * z + vec2( 1.0, 0.0 );

    float iter_count = 0.0;
    float min_cusp_dist = 1e5;
    float trap = 1e5;

    // Radius of the inversion circle of generator b. Sub-bass has to drive BOTH
    // the generator and the pearl-line distance below -- moving only the
    // measured radius would slide the highlight off the orbit points that
    // actually exist and simply extinguish the necklace.
    float circ_r = 1.0 + 0.18 * audioSubBass;

    // Iterated Kleinian group generator transformations:
    // a: z -> z + 2
    // b: z -> -1/z + mu
    for ( int i = 0; i < 28; ++i )
    {
        // Translation fold (generator a)
        z.x = mod( z.x + 1.0, 2.0 ) - 1.0;

        // Circle inversion fold (generator b)
        vec2 z_inv = cInv( z );
        vec2 z_next = -z_inv * ( circ_r * circ_r ) + mu;

        // Check if inside fundamental domain circle
        if ( dot( z_next, z_next ) < dot( z, z ) )
        {
            z = z_next;
            iter_count += 1.0;
        }

        float d_circle = abs( length( z ) - circ_r );
        min_cusp_dist = min( min_cusp_dist, d_circle );
        trap = min( trap, dot( z, z ) );
    }

    // Dynamic texture sample mapped to chaotic attractor coordinate
    vec2 sample_uv = fract( z * 0.3 + 0.5 );
    vec3 tex_col = img( sample_uv );

    // Glowing pearl necklace edge lines
    float pearl_glow = exp( -min_cusp_dist * ( 40.0 + 20.0 * audioCentroid ) ) * glw;

    // Palette blending across iteration depth & orbit trap
    vec3 col_a = imgPalette( iter_count * 0.09 + trap * 0.2 );
    vec3 col_b = imgPalette( iter_count * 0.09 + 0.5 );
    vec3 final_col = mix( col_a, col_b, 0.5 + 0.5 * sin( iter_count * 0.8 + t ) );

    final_col = mix( final_col, tex_col, 0.35 + 0.15 * audioValence );

    // Add neon pearl highlights and kick flash
    vec3 pearl_tint = vec3( 1.3, 1.1, 1.7 ) * pearl_glow * ( 1.0 + 3.0 * audioKick );
    final_col += pearl_tint;

    // Cusp center bloom
    float cusp_bloom = exp( -trap * 3.0 ) * ( 0.8 + 1.2 * audioLevel );
    final_col += imgPalette( 0.8 ) * cusp_bloom;

    final_col = pow( final_col, vec3( 0.87 ) );
    fragColor = vec4( clamp( final_col, 0.0, 1.0 ), 1.0 );
}
