#version 330 core
/*****************************************************************************\
 *                              PenroseAperiodicTessellation.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  PENROSE APERIODIC TESSELLATION: Infinite 5-fold aperiodic Penrose tiling (kites and darts / rhombs) governed by
 *  the Golden Ratio phi (1.618...).
 *
 *  Recursive tile deflation, photoelastic stress birefringence colors, and sacred non-repeating geometric photo
 *  segment mapping.
 *
 *    audioAdvance -> rotates aperiodic deflation hierarchy
 *    audioKick    -> flashes photoelastic stress fringes across tile edges
 *    audioBeatPhase-> animates golden ratio recursive tile expansion
 *    audioChromaHue-> shifts birefringence spectrum colors
 *
 *  Per-activation variety:
 *    tileP  float aperiodic tiling density / scale  (0.5..2.2)
 *    foldP  float 5-fold recursive folding depth    (0.5..2.0)
 *    speedP float kaleidoscopic swirl speed         (0.5..2.0)
 *    hueP   float structural color hue offset       (0..6.28)
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).

uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since this activation, plus a rolled start (see sceneTime).
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

uniform float tileP;  ///< Tile knob: aperiodic tiling density / scale, 0.5..2.2.
uniform float foldP;  ///< Fold knob, 0..1.
uniform float speedP; ///< Speed knob, 0..1.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

const float Phi = 1.61803398875; ///< Golden Ratio

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

/**  IMG-PALETTE (house standard, replaces the generic cos-rainbow): colours come from a rotating arc in the CURRENT
 * slideshow image, so every activation inherits a fresh palette from the photos, and the arc follows the musical
 * key (chromaHue is circular-slewed = jump-free) with a slow advance drift.
 *
 * @param t  Position on the palette arc, 0..1 for one turn. (in)
 *
 * @return
 *   The palette colour (RGB).
 *
 * Valence shapes saturation toward the mood.
 **/
vec3 imgPalette( float t )
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin( audioAdvance * 0.013 );
    vec3  col = img( clamp( vec2( 0.5 ) + rad * vec2( cos( ang ), sin( ang ) ), 0.0, 1.0 ) );
    float g = dot( col, vec3( 0.333 ) );
    return mix( vec3( g ), col, 0.55 + 0.45 * audioValence );
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

/**  2D rotation matrix.
 *
 * @param a  The angle in radians. (in)
 *
 * @return
 *   The rotation matrix.
 **/
mat2 rot2D( float a )
{
    float c = cos( a ), s = sin( a );
    return mat2( c, -s, s, c );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float tl = ( tileP > 0.0 ) ? tileP : 1.0;
    float fld = ( foldP > 0.0 ) ? foldP : 1.0;
    float spd = ( speedP > 0.0 ) ? speedP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float t = time * 0.25 * spd + audioAdvance * 0.15;

    // 5-fold polar symmetry folding
    vec2 p = uv * ( 3.5 / tl ) * ( 1.0 - 0.08 * audioSwell );
    p = rot2D( t * 0.3 ) * p;

    float edge_dist = 1.0;
    float tile_type = 0.0;
    float scale = 1.0;

    // Recursive Penrose grid / de Bruijn pentagrid projection
    float angle_step = 6.2831853 / 5.0;
    vec2  sum_offset = vec2( 0.0 );

    for ( int i = 0; i < 5; ++i )
    {
        float a = float( i ) * angle_step + t * 0.1;
        vec2  dir = vec2( cos( a ), sin( a ) );
        float proj = dot( p, dir ) + float( i ) * 0.2 * fld;

        // Pentagrid stripe boundaries
        float stripe = abs( fract( proj ) - 0.5 );
        edge_dist = min( edge_dist, stripe );

        tile_type += floor( proj );
    }

    // Photoelastic birefringence stress fringes (isochromatics)
    float stress = sin( edge_dist * 40.0 + audioPhase * 4.0 );
    vec3  stress_color = imgPalette( ( stress * 3.0 + tile_type * 0.3 ) * 0.159 );

    // Photo texturing mapped into aperiodic cell frames
    vec2 cell_uv = fract( p * 0.25 + sum_offset );
    vec3 photo = img( cell_uv );

    // Combine visualizer
    vec3 col = mix( photo * 0.85, stress_color, 0.4 + 0.2 * audioSwell );

    // Glowing golden-ratio tile borders
    float border_glow = exp( -edge_dist * 30.0 ) * ( 1.0 + audioKick * 3.0 + audioHigh * 1.5 );
    col += border_glow * vec3( 1.0, 0.88, 0.45 );

    if ( audioChromaHue != 0.0 )
        if ( hue > 0.001 )
            col = hueRot( col, hue );

    // Vignette
    float vig = smoothstep( 1.35, 0.3, length( uv ) );
    col *= vig;

    fragColor = vec4( col, 1.0 );
}
