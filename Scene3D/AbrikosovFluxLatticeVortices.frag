#version 330 core
/*****************************************************************************\
 *                              AbrikosovFluxLatticeVortices.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Point-sprite lattice of superconducting flux vortices, each a soft circular glow blending a cyan/violet vortex
 *  palette with the slideshow photo sampled from the vortex's own world position.
 *
 *  audioPhase drives the cyan-to-violet oscillation of each vortex's colour;
 *  audioKick punches up a hot, palette-tinted core on every hit; audioChromaHue
 *  and the hueP preset both rotate the final hue. Vertex-side uniforms
 *  (audioSubBass, audioBass, audioFlux, etc.) shape the lattice's own motion in
 *  the companion .vert. The fragment ends with a soft-knee tone-mapping step
 *  so loud audio compresses instead of clipping to white.
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).

in vec3  vWorldPos;    ///< World position (from the vertex stage).
in float vVortexPhase; ///< Vortex phase (from the vertex stage).

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

uniform float fluxP;   ///< Flux knob, 0.5..2.
uniform float kelvinP; ///< Kelvin knob, 0.5..2.
uniform float speedP;  ///< Speed knob, 0..1.
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

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    // Point sprite circular Gaussian profile
    vec2  pt = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot( pt, pt );
    if ( r2 > 1.0 )
        discard;
    float sprite_glow = exp( -r2 * 4.0 );

    // Photo texture mapping from world coords
    vec2 photo_uv = fract( vWorldPos.xy * 0.3 + 0.5 );
    vec3 photo = img( photo_uv );

    // Quantized flux vortex cyan & violet palette
    vec3 flux_cyan = vec3( 0.1, 0.9, 1.0 );
    vec3 flux_violet = vec3( 0.7, 0.2, 1.0 );
    vec3 vortex_color = mix( flux_cyan, flux_violet, sin( vVortexPhase * 12.56 + audioPhase ) * 0.5 + 0.5 );

    vec3 col = mix( photo, vortex_color, 0.6 ) * sprite_glow;
    // Hot core TINTED by the palette (white additive term drowned the
    // cyan/violet; metric scan: saturation 0.11).
    col += sprite_glow * mix( vortex_color, vec3( 1.0, 0.98, 0.9 ), 0.35 )
           * ( 0.45 + audioKick * 1.8 );

    if ( audioChromaHue != 0.0 )
        col = hueRot( col, audioChromaHue );
    if ( hue > 0.001 )
        col = hueRot( col, hue );

    // Catalogue review: soft-knee exposure — hot audio compresses
    // instead of clipping the whole frame to white.
    vec3 cat_tone = ( col ) * 0.55;
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( cat_tone, sprite_glow );
}
