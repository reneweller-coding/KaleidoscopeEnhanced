#version 330 core
/*****************************************************************************\
 *                              EventHorizonSingularityPlunge.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  EVENT HORIZON SINGULARITY PLUNGE: Relativistic free-fall plunge past the Schwarzschild event horizon into the
 *  central singularity with tidal spaghettification, celestial sky compression into a shrinking Einstein circle,
 *  and chaotic plasma flares.
 *
 *  Audio Reactivity:
 *    audioAdvance -> drives continuous relativistic gravitational plunge progression
 *    audioKick    -> flashes singularity core & triggers tidal force gravitational wave chirps
 *    audioCentroid-> modulates relativistic accretion filament frequency
 *    audioSubBass -> expands tidal stretching distortion amplitude
 *    audioChromaHue-> steers the extreme gravitational redshift/blueshift spectrum
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

// Per-activation variety
uniform float speedP;  ///< Speed knob, 0..1.
uniform float tidalP;  ///< Tidal knob, 0.8..1.6.
uniform float plasmaP; ///< Plasma knob, 0.7..1.5.
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

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution.xy ) / min( resolution.x, resolution.y );

    float spd = ( speedP > 0.01 ) ? speedP : 1.0;
    float tdl = ( tidalP > 0.01 ) ? tidalP : 1.2;
    float plsm = ( plasmaP > 0.01 ) ? plasmaP : 1.0;
    float glw = ( glowP > 0.01 ) ? glowP : 1.0;

    float t = time * 0.240 * spd + audioAdvance * 0.240 * spd;
    // Time base + music push: audioAdvance ALONE stands still in quiet
    // music (the reported "looks like a still picture" class).

    float r = length( uv );
    float a = atan( uv.y, uv.x );

    // Relativistic tidal stretching (spaghettification along radial coordinate)
    float tidal_stretch = ( 1.5 + 0.8 * sin( audioSwell * 2.5 ) + 0.5 * audioSubBass ) * tdl;
    vec2  p_tidal = vec2(
        ( uv.x / max( 0.1, r ) ) * pow( r, 1.0 / tidal_stretch ),
        ( uv.y / max( 0.1, r ) ) * pow( r, tidal_stretch ) );

    // Shrinking Einstein celestial sky disk at top of screen (view of the outer universe)
    vec2  sky_pos = uv - vec2( 0.0, 0.35 );
    float d_sky = length( sky_pos );
    float sky_mask = smoothstep( 0.28, 0.22, d_sky );

    // Swirling inner plasma turbulence inside event horizon
    // Brightness raises the SPATIAL frequency of the accretion filaments only;
    // the t-driven terms keep their fixed rate so the phase is never remapped.
    float filament_freq = 12.0 * ( 1.0 + 0.45 * audioCentroid );
    float plasma_noise = sin( p_tidal.x * filament_freq + t * 4.0 ) * cos( p_tidal.y * filament_freq - t * 3.5 );
    // Whole numbers of spiral arms, blended between the two around filament_freq / 2: the count glides with the
    // music and still closes round the circle (a fractional count tore along atan's cut, 17.10.2026).
    float arms = filament_freq * 0.5;
    float arm_lo = floor( arms );
    float sp_phase = -( 1.0 / max( 0.05, r ) ) * 4.0 + t * 6.0;
    float plasma_spiral = mix( sin( a * arm_lo + sp_phase ), sin( a * ( arm_lo + 1.0 ) + sp_phase ), fract( arms ) );

    // Sample slideshow texture on outer universe disk vs inner plasma
    vec2 sky_uv = fract( sky_pos * 1.5 + 0.5 );
    vec3 sky_col = img( sky_uv ) * ( 1.2 + 0.8 * audioLevel );

    // Mirrored, not wrapped: fract() cut the photo along the horizontal axis, where p_tidal.y crosses 0 (17.10.2026).
    vec2 plasma_uv = abs( fract( ( p_tidal * 0.5 + vec2( t * 0.1, 0.0 ) ) * 0.5 ) * 2.0 - 1.0 );
    vec3 plasma_tex = img( plasma_uv );

    // Inner singularity palette (deep ultraviolet to gleam-white)
    vec3 pal_sing = imgPalette( r * 2.0 + t * 0.1 );
    vec3 plasma_col = mix( plasma_tex, pal_sing, 0.5 ) * ( 0.6 + 0.4 * plasma_noise ) * plsm;

    // Glowing photon ring and singularity point
    float photon_ring = exp( -abs( d_sky - 0.25 ) * 35.0 ) * ( 1.5 + 3.0 * audioKick ) * glw;
    float singularity_glow = exp( -r * 12.0 ) * ( 2.0 + 4.0 * audioKick );

    vec3 final_col = mix( plasma_col, sky_col, sky_mask );
    final_col += vec3( 1.8, 1.5, 1.2 ) * photon_ring;
    final_col += imgPalette( 0.85 ) * singularity_glow;

    final_col = pow( final_col, vec3( 0.88 ) );
    // Highlights x0.8 before the clamp (17.10.2026): 9 % of the frame was bright, colourless and flat -- values
    // above 1 clipped to one plateau, which the soft knee and the auto exposure turned into a flat grey.  The
    // auto exposure lifts the frame back; the highlights keep their gradation.
    const float HiK = 0.8;
    fragColor = vec4( clamp( final_col * HiK, 0.0, 1.0 ), 1.0 );
}
