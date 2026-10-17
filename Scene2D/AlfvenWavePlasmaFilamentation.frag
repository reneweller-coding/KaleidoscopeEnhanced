#version 330 core
/*****************************************************************************\
 *                              AlfvenWavePlasmaFilamentation.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  ALFVÉN WAVE PLASMA FILAMENTATION: Torsional shear Alfvén waves in solar coronal flux tubes.
 *
 *  Magnetohydrodynamic wave propagation along magnetic field lines undergoes non-linear filamentation, creating
 *  phase-mixed current sheets, turbulent plasma heating channels, and coronal photo texturing.
 *
 *    audioAdvance -> propagates Alfvén wave packets along magnetized coronal flux tubes
 *    audioKick    -> flashes phase-mixed current sheet Joule heating reconnection bursts
 *    audioBass    -> deepens coronal flux tube guide field compression & magnetic pressure
 *    audioSwell   -> widens plasma filamentation channel thickness & thermal luminance
 *    audioCentroid-> shifts extreme ultraviolet (EUV) Fe XIV/Fe XVI emission spectra
 *
 *  Per-activation variety:
 *    filamentCountP float number of filamentary plasma channels   (3.0..10.0)
 *    alfvenSpeedP   float Alfvén wave phase velocity               (0.6..2.2)
 *    jouleHeatP     float current sheet Joule heating brightness  (0.8..2.5)
 *    phaseMixP      float phase-mixing shear gradient strength    (0.5..2.2)
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
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioSubBass;   ///< Sub-bass band level, 0..1.
uniform float audioBass;      ///< Bass band level, 0..1.
uniform float audioMid;       ///< Mid band level, 0..1.
uniform float audioHigh;      ///< High band level, 0..1.
uniform float audioFlux;      ///< Spectral flux (how fast the spectrum changes), 0..1.

uniform float filamentCountP; ///< Filament count knob: number of filamentary plasma channels, 3..10.
uniform float alfvenSpeedP;   ///< Alfven speed knob: Alfvén wave phase velocity, 0.6..2.2.
uniform float jouleHeatP;     ///< Joule heat knob: current sheet Joule heating brightness, 0.8..2.5.
uniform float phaseMixP;      ///< Phase mix knob: phase-mixing shear gradient strength, 0.5..2.2.

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
    float t = time * 0.45 + audioAdvance * 0.4;

    // Magnetic guide field aligned along Y-axis
    float v_a = ( alfvenSpeedP > 0.01 ? alfvenSpeedP : 1.3 );
    float n_fil = ( filamentCountP > 1.0 ? filamentCountP : 6.0 );

    // Torsional shear Alfvén wave displacement: delta B_x(x, y, t)
    float k_mix = ( phaseMixP > 0.01 ? phaseMixP : 1.2 );
    float alfven_phase = uv.y * 12.0 - t * 4.0 * v_a + sin( uv.x * n_fil * 3.14159265 * k_mix ) * 2.0;

    float wave_amp = sin( alfven_phase + audioPhase * 0.3 ) * 0.12;
    float dx = uv.x + wave_amp;

    // Filamentary current sheets: j_z = d(delta B_x)/dy
    float fil_id = floor( dx * n_fil );
    float local_fil_x = fract( dx * n_fil ) - 0.5;
    float current_sheet = exp( -local_fil_x * local_fil_x * 35.0 );

    // Phase-mixing Joule dissipation heating
    float joule_heating = pow( abs( cos( alfven_phase ) ), 2.5 ) * current_sheet;
    joule_heating *= ( 1.0 + 3.5 * audioKick ) * ( jouleHeatP > 0.01 ? jouleHeatP : 1.3 );

    // Coronal EUV plasma colors
    vec3 coronal_euv = vec3( 0.1, 0.9, 0.7 );
    vec3 flare_amber = vec3( 1.0, 0.45, 0.1 );
    vec3 heat_white = vec3( 1.0, 0.95, 0.9 );

    vec3 col_corona = palTint( mix( coronal_euv, flare_amber, clamp( joule_heating, 0.0, 1.0 ) ),
                               uv.y * 0.2 + audioCentroid, 0.26 );

    // Background photo sampling
    vec2 bg_uv = gl_FragCoord.xy / resolution;
    vec3 bg = img( bg_uv ) * 0.25;

    vec3 col = bg;
    col += col_corona * current_sheet * ( 0.8 + 0.4 * audioSwell ) * 1.6;
    col += heat_white * joule_heating * 2.4;
    col += col_corona * abs( wave_amp * 5.0 ) * 1.2;
    col += col_corona * ( audioKick * 0.35 );

    // Soft knee compression
    col /= 1.0 + 0.35 * max( col.r, max( col.g, col.b ) );
    fragColor = vec4( clamp( col, 0.0, 1.0 ), 1.0 );
}
