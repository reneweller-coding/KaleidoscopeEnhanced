#version 330 core
/*****************************************************************************\
 *                              MagnetoRotationalHypernovaInstability.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  MAGNETOROTATIONAL HYPERNOVA INSTABILITY: Relativistic bipolar plasma jets launched by core collapse in rapidly
 *  rotating magnetized hypernovae, wrapped by a frame-spanning accretion torus and set against a far field of
 *  ejecta.
 *
 *  Helical magnetic flux tubes, Alfven wave turbulences, magnetic reconnection flares, and synchrotron photo
 *  texturing.
 *
 *    audioAdvance -> accelerates helical magnetic jet outflow & rotation rate, and drifts the
 *                    far ejecta
 *    audioKick    -> ignites explosive magnetic reconnection flash detonations, and twinkles
 *                    the ejecta
 *    audioBass    -> pulses accretion torus diameter & magnetosphere envelope
 *    audioSwell   -> thickens relativistic plasma jet filament core glow & brightens the ejecta
 *    audioCentroid-> shifts synchrotron radiation emission spectra
 *
 *  Per-activation variety:
 *    jetGlowP  float plasma jet filament luminance          (0.8..2.5)
 *    reconnP   float magnetic reconnection burst intensity   (0.5..2.2)
 *    coreRadP  float stellar core accretion torus brightness (0.6..2.0)
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).

in vec3  vPos;     ///< Position (from the vertex stage).
in float vFluxIdx; ///< Flux idx (from the vertex stage).
in float vEnergy;  ///< Energy (from the vertex stage).
in float vHaze;    ///< Haze (from the vertex stage).

uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                              ///< backwards).
uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSwell;     ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioCentroid;  ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float jetGlowP; ///< Jet glow knob: plasma jet filament luminance, 0.8..2.5.
uniform float reconnP;  ///< Reconn knob: magnetic reconnection burst intensity, 0.5..2.2.

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

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float pal_coord = fract( vFluxIdx + abs( vPos.z ) * 0.2 + audioCentroid );
    vec3  strand_color = imgPalette( pal_coord );

    if ( vHaze > 0.5 )
    {
        // FAR EJECTA: the same palette, unlit and far dimmer -- a background
        // layer that fills the empty sky without lifting it toward grey.
        vec3 h = strand_color * vEnergy * ( 0.85 + 0.5 * audioSwell );
        h /= 1.0 + 0.35 * max( h.r, max( h.g, h.b ) );
        fragColor = vec4( clamp( h, 0.0, 1.0 ), 1.0 );
        return;
    }

    // Core stellar accretion center glow
    float r_core = length( vPos.xy );
    float central_core = exp( -dot( vPos, vPos ) * 1.5 ) * ( 1.0 + 3.0 * audioKick );

    vec2 photo_uv = fract( vPos.xy * 0.3 + 0.5 );
    vec3 photo_sample = img( photo_uv );

    // Synchrotron brightness falls off along the flux tube; without a real
    // per-point gradient the whole bundle shaded to one tone.
    float axial_glow = exp( -abs( vPos.z ) * 0.45 );
    float rim_glow = exp( -r_core * 1.1 );

    vec3 col = strand_color * ( 0.6 + 0.4 * photo_sample ) * vEnergy;
    col *= ( jetGlowP > 0.01 ? jetGlowP : 1.2 ) * ( 0.8 + 0.4 * audioSwell );
    col *= 0.55 + 0.95 * ( 0.5 * axial_glow + 0.5 * rim_glow );
    // Capped: central_core reaches 4 on a kick, and the core sits dead centre of
    // the frame now that the tilt no longer parks the object under the bottom
    // edge -- uncapped it flared a white disc across a twentieth of the picture.
    col += min( imgPalette( 0.1 ) * central_core * 2.5, vec3( 1.1 ) );
    col += strand_color * ( audioKick * 0.35 );
    // Magnetic reconnection flare along the tube (reconnP was declared and never
    // read -- the documented reconnection burst had no effect at all).
    float reconn = ( reconnP > 0.01 ? reconnP : 1.0 );
    float flare = exp( -abs( fract( vFluxIdx * 7.0 + vPos.z * 0.35 + audioAdvance * 0.2 ) - 0.5 ) * 9.0 );
    col += min( imgPalette( 0.62 ) * flare * reconn * ( 0.20 + 0.55 * audioKick ), vec3( 0.7 ) );

    // Ceiling just under the knee's clipping point (1.47 in -> 0.97 out).
    col = min( col, vec3( 1.40 ) );

    // Soft knee compression
    col /= 1.0 + 0.35 * max( col.r, max( col.g, col.b ) );
    fragColor = vec4( clamp( col, 0.0, 1.0 ), 1.0 );
}
