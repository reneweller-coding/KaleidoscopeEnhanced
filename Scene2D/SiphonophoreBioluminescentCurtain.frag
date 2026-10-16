#version 330 core
/*****************************************************************************\
 *                              SiphonophoreBioluminescentCurtain.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  SIPHONOPHORE BIOLUMINESCENT CURTAIN: Massive colonial siphonophore (Praya dubia / Apolemia) cascading through
 *  deep abyssal oceanic trenches.
 *
 *  Translucent swimming bells (nectophores), bioluminescent glowing tentilla curtains, and rhythmic contraction
 *  light waves.
 *
 *    audioAdvance -> drives oceanic current drift & tentacle undulating waves
 *    audioKick    -> flashes defensive bioluminescent luminescence cascades
 *    audioSwell   -> thickens colonial bell volume & oceanic caustic haze
 *    audioCentroid-> shifts bio-luciferin amber/cyan emission spectra
 *    audioFlux    -> excites sparkling nematocyst battery point flashes
 *
 *  Per-activation variety:
 *    nectoCountP  float nectophore swimming bell density         (3.0..8.0)
 *    tentillaP    float tentacle curtain strand density          (8.0..24.0)
 *    bioGlowP     float bioluminescence emission brightness      (0.8..2.5)
 *    waveScaleP   float hydrodynamic tentacle wave amplitude     (0.5..2.2)
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
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioSubBass;   ///< Sub-bass band level, 0..1.
uniform float audioBass;      ///< Bass band level, 0..1.
uniform float audioMid;       ///< Mid band level, 0..1.
uniform float audioHigh;      ///< High band level, 0..1.
uniform float audioFlux;      ///< Spectral flux (how fast the spectrum changes), 0..1.

uniform float nectoCountP; ///< Necto count knob: nectophore swimming bell density, 3..8.
uniform float tentillaP;   ///< Tentilla knob: tentacle curtain strand density, 8..24.
uniform float bioGlowP;    ///< Bio glow knob: bioluminescence emission brightness, 0.8..2.5.
uniform float waveScaleP;  ///< Wave scale knob: hydrodynamic tentacle wave amplitude, 0.5..2.2.

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
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin( audioAdvance * 0.013 );
    vec3  col = img( clamp( vec2( 0.5 ) + rad * vec2( cos( ang ), sin( ang ) ), 0.0, 1.0 ) );
    float g = dot( col, vec3( 0.333 ) );
    return mix( vec3( g ), col, 0.55 + 0.45 * audioValence );
}

/**  Tints a colour toward the house palette at t, keeping its brightness.
 *
 * @param c  The colour. (in)
 * @param t  Position on the palette, 0..1. (in)
 * @param k  Strength of the tint, 0..1. (in)
 *
 * @return
 *   The tinted colour.
 **/
vec3 palTint( vec3 c, float t, float k )
{
    vec3 tp = imgPalette( t );
    tp *= dot( c, vec3( 0.3333 ) ) / max( dot( tp, vec3( 0.3333 ) ), 1e-3 );
    return mix( c, tp, k );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2  uv = ( gl_FragCoord.xy - 0.5 * resolution ) / min( resolution.x, resolution.y );
    float t = time * 0.35 + audioAdvance * 0.3;

    // Colonial stem axis curving through abyssal water
    float wave_amp = ( waveScaleP > 0.01 ? waveScaleP : 1.2 );
    float stem_x = sin( uv.y * 2.5 + t * 0.6 ) * 0.35 * wave_amp;
    float dx_stem = uv.x - stem_x;

    // Nectophore bells arranged along colonial stem
    float necto_freq = ( nectoCountP > 1.0 ? nectoCountP : 5.0 );
    float bell_phase = uv.y * necto_freq + t * 1.5;
    float bell_local_y = fract( bell_phase ) - 0.5;

    // Dome profile of each nectophore bell
    float bell_radius = 0.22 * ( 1.0 + 0.3 * audioSwell );
    float bell_dist = length( vec2( dx_stem, bell_local_y * 0.3 ) );
    float in_bell = smoothstep( bell_radius + 0.02, bell_radius - 0.04, bell_dist );
    float bell_rim = exp( -abs( bell_dist - bell_radius ) * 35.0 );

    // Hanging tentilla curtains trailing behind stem
    float tent_freq = ( tentillaP > 0.01 ? tentillaP : 14.0 );
    float tent_waves = sin( uv.x * tent_freq + sin( uv.y * 8.0 - t * 3.0 ) * 2.0 );
    float tentilla = exp( -abs( dx_stem - 0.25 ) * 4.0 ) * ( tent_waves * 0.5 + 0.5 );

    // Bioelectric traveling contraction wave along the whole siphonophore
    float traveling_wave = sin( uv.y * 6.0 - t * 4.0 + audioPhase ) * 0.5 + 0.5;
    float bio_pulse = pow( traveling_wave, 3.0 ) * ( 1.0 + 3.0 * audioKick ) * ( bioGlowP > 0.01 ? bioGlowP : 1.2 );

    // Marine snow & sparkling nematocysts
    float spark = pow( max( 0.0, sin( uv.x * 45.0 + uv.y * 35.0 + t * 4.0 + audioFlux * 3.0 ) ), 12.0 )
                  * ( 0.8 + 1.5 * audioHigh );

    // Siphonophore deep-sea cyan / amber bioluminescent palette
    vec3 deep_water = vec3( 0.01, 0.03, 0.08 );
    vec3 bio_cyan = vec3( 0.1, 0.85, 0.95 );
    vec3 bio_amber = vec3( 1.0, 0.65, 0.2 );

    vec3 bell_color = palTint( mix( bio_cyan, bio_amber, traveling_wave ), uv.y * 0.2 + audioCentroid, 0.27 );

    // Background photo sampling
    vec2 bg_uv = gl_FragCoord.xy / resolution;
    vec3 bg = img( bg_uv ) * 0.2;

    vec3 col = bg + palTint( deep_water, 0.5, 0.15 );
    col += bell_color * in_bell * ( 0.6 + 0.4 * traveling_wave ) * ( 0.8 + 0.4 * audioSwell );
    col += vec3( 0.9, 0.95, 1.0 ) * bell_rim * 1.8;
    col += bell_color * tentilla * bio_pulse * 1.6;
    col += vec3( 0.85, 1.0, 0.9 ) * spark * 2.2;
    col += bell_color * ( audioKick * 0.35 );

    // Soft knee compression
    col /= 1.0 + 0.35 * max( col.r, max( col.g, col.b ) );
    fragColor = vec4( clamp( col, 0.0, 1.0 ), 1.0 );
}
