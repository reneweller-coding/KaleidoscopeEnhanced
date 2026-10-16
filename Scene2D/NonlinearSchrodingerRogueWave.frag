#version 330 core
/*****************************************************************************\
 *                              NonlinearSchrodingerRogueWave.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  NONLINEAR SCHRÖDINGER ROGUE WAVE: Peregrine breather soliton / oceanic freak monster wave.
 *
 *  Non-linear modulational instability (Benjamin-Feir) focuses continuous background wave trains into a sudden
 *  triple-height oceanic rogue wave wall with foaming crests and deep abyssal troughs.
 *
 *    audioAdvance -> navigates Peregrine breather non-linear focusing spacetime coordinates
 *    audioKick    -> flashes catastrophic rogue wave breaking crest & foam detonation bursts
 *    audioBass    -> deepens preceding abyssal wave trough hole in the sea & gravitational swell
 *    audioSwell   -> widens rogue wave wall width & background wavepacket envelope
 *    audioCentroid-> shifts stormy ocean water transmission / foam scattering color spectra
 *
 *  Per-activation variety:
 *    breatherScaleP float Peregrine soliton spacetime focus scale  (0.8..2.2)
 *    carrierFreqP   float background carrier wave frequency        (6.0..20.0)
 *    crestFoamP     float breaking rogue wave foam luminance gain  (0.8..2.5)
 *    troughDepthP   float abyssal trough hole depth parameter      (0.6..2.2)
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

uniform float breatherScaleP; ///< Breather scale knob: Peregrine soliton spacetime focus scale, 0.8..2.2.
uniform float carrierFreqP;   ///< Carrier freq knob: background carrier wave frequency, 6..20.
uniform float crestFoamP;     ///< Crest foam knob: breaking rogue wave foam luminance gain, 0.8..2.5.
uniform float troughDepthP;   ///< Trough depth knob: abyssal trough hole depth parameter, 0.6..2.2.

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
    float t = time * 0.4 + audioAdvance * 0.35;

    // Spacetime coordinates around Peregrine breather focusing center (X, T)
    float b_scale = ( breatherScaleP > 0.01 ? breatherScaleP : 1.2 );
    // SIDE VIEW: the old build painted |Psi| as a full-screen heat-map,
    // which recorded as horizontal stripes.  Here the breather drives the
    // SURFACE ELEVATION of a sea seen from the side, so the focusing event
    // rises out of the carrier swell as an actual wall of water.
    // The rogue wave WANDERS through the picture (a triangle sweep, continuous)
    // -- before, the breather's peak stood fixed in the middle and only twitched.
    float x_drift = ( abs( fract( t * 0.05 ) * 2.0 - 1.0 ) * 2.0 - 1.0 ) * 1.1;
    float X = ( uv.x - x_drift ) * 3.5 * b_scale;
    // The breather's focusing parameter T cycles slowly: the rogue wall
    // builds, towers and vanishes back into the swell (once per ~14 s).
    float tb = sin( t * 0.45 ) * 2.2;
    float denom = 1.0 + 4.0 * ( X * X ) + 4.0 * ( tb * tb );
    float real_part = 1.0 - 4.0 / denom;
    float imag_part = -8.0 * tb / denom;
    float envelope = sqrt( real_part * real_part + imag_part * imag_part );

    float k_carrier = ( carrierFreqP > 0.01 ? carrierFreqP : 12.0 );
    float carrier = cos( X * k_carrier * 0.55 - t * 2.2 + audioPhase * 0.5 );

    // Surface elevation in frame units; envelope peaks at 3x the carrier.
    float h = envelope * carrier * 0.16 * ( 0.85 + 0.35 * audioSwell );
    float surface_y = -0.04 + h;
    float below = surface_y - uv.y; // > 0 means under water

    float trough = smoothstep( -0.5, -1.8, h * 9.0 )
                   * ( troughDepthP > 0.01 ? troughDepthP : 1.2 ) * ( 1.0 + 0.4 * audioBass );

    // Foam rides the crest line, detonating where the envelope focuses.
    float crest_foam = exp( -abs( below ) * 38.0 )
                       * ( 0.35 + 0.65 * smoothstep( 1.4, 2.8, envelope * abs( carrier ) + envelope ) );
    crest_foam *= ( 1.0 + 3.5 * audioKick ) * ( crestFoamP > 0.01 ? crestFoamP : 1.3 );

    vec3 deep_trough = vec3( 0.01, 0.05, 0.12 );
    vec3 ocean_blue = vec3( 0.12, 0.60, 0.95 );
    vec3 foam_white = vec3( 0.92, 0.96, 1.0 );

    float depth = clamp( below * 0.8, 0.0, 1.0 );
    vec3  water_col = palTint( mix( ocean_blue, deep_trough, depth ),
                               depth * 0.25 + 0.05, 0.25 );

    // Storm sky above the surface: dark photo clouds.
    vec2 bg_uv = gl_FragCoord.xy / resolution;
    vec3 sky = img( bg_uv ) * mix( 0.60, 0.16, clamp( uv.y * 1.6 + 0.4, 0.0, 1.0 ) );

    float in_water = smoothstep( -0.004, 0.004, below );
    vec3  col = mix( sky, water_col, in_water );
    // Subsurface glow: the water carried no light of its own and the sea
    // read as a black field under an oscilloscope trace.
    col += ocean_blue * exp( -max( below, 0.0 ) * 2.6 ) * 0.55 * in_water;
    // Secondary swell ripples give the surface a body below the crest line.
    col += water_col * ( 0.5 + 0.5 * sin( X * k_carrier * 1.1 + below * 30.0 - t * 2.0 ) )
           * 0.10 * in_water;
    col += foam_white * crest_foam * 1.9;
    col -= deep_trough * trough * 0.6 * in_water;
    col += foam_white * ( audioKick * 0.35 );

    // Soft knee compression
    col /= 1.0 + 0.35 * max( col.r, max( col.g, col.b ) );
    fragColor = vec4( clamp( col, 0.0, 1.0 ), 1.0 );
}
