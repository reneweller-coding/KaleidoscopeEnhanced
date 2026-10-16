#version 330 core
/*****************************************************************************\
 *                              HyperbolicHoneycombTessellation.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  HYPERBOLIC HONEYCOMB TESSELLATION: Poincaré disk model of a 7-fold {7,3} hyperbolic honeycomb tiling.
 *
 *  Non-Euclidean SL(2, R) Möbius translations, exponential boundary tile packing, and glowing hyperbolic circular
 *  arcs.
 *
 *  Audio Reactivity:
 *    audioAdvance -> drives continuous non-Euclidean hyperbolic geodesic translation
 *    audioKick    -> flashes hyperbolic vertex nodes & boundary shockwaves
 *    audioCentroid-> modulates 7-fold symmetry ribbing resolution
 *    audioSubBass -> expands Poincaré disk breathing radius
 *    audioChromaHue-> rotates the non-Euclidean hyperbolic spectrum
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
uniform float speedP;     ///< Speed knob, 0..1.
uniform float symmetryP;  ///< Symmetry knob, 5..9.
uniform float tileScaleP; ///< Tile scale knob, 0.7..1.4.
uniform float glowP;      ///< Glow / afterglow knob, 0..1.
uniform float hueP;       ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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
    return vec2( dot( a, b ), a.y * b.x - a.x * b.y ) / max( 1e-6, dot( b, b ) );
}

/**  Hyperbolic Möbius translation in the unit disk: w = (z - a) / (1 - conj(a)*z)
 *
 * @param z  The point in the disc. (in)
 * @param a  The translation (inside the disc). (in)
 *
 * @return
 *   w.
 **/
vec2 mobiusTranslate( vec2 z, vec2 a )
{
    vec2 num = z - a;
    vec2 den = vec2( 1.0, 0.0 ) - vec2( a.x * z.x + a.y * z.y, a.x * z.y - a.y * z.x );
    return cDiv( num, den );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution.xy ) / min( resolution.x, resolution.y );

    float spd = ( speedP > 0.01 ) ? speedP : 1.0;
    float n_sym = ( symmetryP > 1.0 ) ? symmetryP : 7.0;
    float sc = ( tileScaleP > 0.01 ) ? tileScaleP : 1.0;
    float glw = ( glowP > 0.01 ) ? glowP : 1.0;

    float t = time * 0.192 * spd + audioAdvance * 0.192 * spd;
    // Zeit-Basis + Musik-Schub: audioAdvance ALLEIN steht bei ruhiger
    // Musik still (die gemeldete "wirkt wie ein Bild"-Klasse).

    // Scale disk. Sub-bass shrinks the coordinate multiplier, which pushes the
    // r_disk==1 boundary (and the rim halo that rings it) further out on screen --
    // the Poincare disk itself breathes wider on drones.
    vec2  z = uv * ( 1.8 * sc ) / ( 1.0 + 0.3 * audioSubBass );
    float r_disk = length( z );

    // Hyperbolic translation offset in unit disk
    float a_trans = t * 0.3 + audioPhase * 0.1;
    float r_trans = 0.45 * sin( t * 0.4 + audioSwell * 2.0 );
    vec2  a_param = vec2( cos( a_trans ), sin( a_trans ) ) * r_trans;

    // Apply Möbius transform
    z = mobiusTranslate( z, a_param );

    // Heptagonal / 7-Fold radial symmetry fold
    float a = atan( z.y, z.x );
    float r = length( z );
    float seg = 6.2831853 / n_sym;
    a = mod( a + seg * 0.5, seg ) - seg * 0.5;
    a = abs( a );
    vec2 p_fold = vec2( cos( a ), sin( a ) ) * r;

    // Hyperbolic geodesic circular arc distance
    // In Poincaré disk, geodesics are circles orthogonal to the boundary
    float r_arc = 0.52;
    vec2  c_arc = vec2( 0.85, 0.0 );
    float d_arc = abs( length( p_fold - c_arc ) - r_arc );

    // Glowing hyperbolic tile borders
    float border_glow = exp( -d_arc * ( 25.0 + 12.0 * audioCentroid ) ) * glw;

    // Sample distorted background photo
    vec2 sample_uv = fract( p_fold * 0.5 + 0.5 );
    vec3 tex_col = img( sample_uv );

    // Non-Euclidean spectrum palette
    vec3 pal_a = imgPalette( r * 0.8 + t * 0.05 );
    vec3 pal_b = imgPalette( r * 0.8 + 0.5 );
    vec3 col = mix( pal_a, pal_b, 0.5 + 0.5 * sin( a * n_sym ) );

    col = mix( col, tex_col, 0.35 + 0.15 * audioValence );

    // Add glowing hyperbolic arcs & kick flash
    vec3 arc_tint = vec3( 1.4, 1.1, 1.8 ) * border_glow * ( 1.0 + 2.5 * audioKick );
    col += arc_tint;

    // Boundary infinity glow: a thin halo AT the unit disk's edge. The
    // previous smoothstep(0.7,1.0,r_disk) saturates to its max for any pixel
    // past r_disk~1.0 -- and since r_disk = length(uv*1.8*sc) exceeds 1.0
    // across most of the frame (uv already reaches past +-1 along the
    // screen's longer axis), that flooded nearly the whole image with a
    // flat, overexposed tint instead of ringing just the disk's rim.
    float rim_glow = exp( -abs( r_disk - 1.0 ) * 8.0 ) * ( 0.4 + 0.5 * audioKick );
    col += imgPalette( 0.85 ) * rim_glow;

    col = pow( col, vec3( 0.88 ) );
    fragColor = vec4( clamp( col, 0.0, 1.0 ), 1.0 );
}
