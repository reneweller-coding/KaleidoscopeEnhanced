#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file RelativisticSynchrotronPulsarWind.frag
 * @brief RELATIVISTIC SYNCHROTRON PULSAR WIND: Pulsar wind nebula (Crab Nebula PWN). Magnetized
 * electron-positron relativistic plasma wind undergoes termination shock, forming equatorial
 * synchrotron torus rings, polar collimated plasma jets, and magnetic wisps.
 *   audioAdvance -> accelerates pulsar rotational frequency & relativistic wind outflow
 *   audioKick    -> flashes central pulsar lighthouse beam & magnetic reconnection flares
 *   audioBass    -> expands equatorial termination shock torus radius & synchrotron brightness
 *   audioSwell   -> enriches nebula magnetic filamentation density & optical polarization glow
 *   audioCentroid-> shifts non-thermal synchrotron continuum emission spectra
 *
 * Per-activation variety:
 *   torusRadiusP float equatorial termination shock radius       (0.3..0.9)
 *   jetCollimP   float polar relativistic jet collimation width  (0.08..0.35)
 *   wispCountP   float dynamic magnetic wisp ripple density      (4.0..14.0)
 *   synchGlowP   float synchrotron torus luminance gain          (0.8..2.5)
 */

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

uniform float torusRadiusP; ///< Torus radius knob: equatorial termination shock radius, 0.3..0.9.
uniform float jetCollimP;   ///< Jet collim knob: polar relativistic jet collimation width, 0.08..0.35.
uniform float wispCountP;   ///< Wisp count knob: dynamic magnetic wisp ripple density, 4..14.
uniform float synchGlowP;   ///< Synch glow knob: synchrotron torus luminance gain, 0.8..2.5.

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

    // Tilted equatorial plane for synchrotron torus rings
    float tilt = 0.55;
    float c_tilt = cos( tilt ), s_tilt = sin( tilt );
    vec2  p_torus = vec2( uv.x, uv.y / s_tilt );
    float r_torus = length( p_torus );

    // Equatorial termination shock torus
    float r_shock = ( torusRadiusP > 0.01 ? torusRadiusP : 0.5 ) * ( 0.85 + 0.3 * audioBass );
    float torus_ring = exp( -abs( r_torus - r_shock ) * 18.0 );

    // Moving dynamic synchrotron wisps expanding outward from shock
    float w_freq = ( wispCountP > 0.01 ? wispCountP : 8.0 );
    float wisps = sin( r_torus * w_freq - t * 4.0 + audioPhase ) * exp( -r_torus * 2.0 );

    // Polar collimated relativistic plasma jets along Y-axis
    float j_width = ( jetCollimP > 0.01 ? jetCollimP : 0.16 );
    float polar_jet = exp( -abs( uv.x ) * abs( uv.x ) / ( j_width * j_width ) ) * smoothstep( 0.05, 0.8, abs( uv.y ) );

    // Central pulsar lighthouse beam rotation
    float p_angle = atan( uv.y, uv.x );
    float beam = pow( max( 0.0, cos( p_angle - t * 8.0 ) ), 12.0 ) * ( 1.0 + 3.5 * audioKick );

    // Central pulsar neutron star core
    float core = exp( -dot( uv, uv ) * 55.0 ) * ( 1.0 + 2.0 * audioKick );

    // Synchrotron emission colors: electric blue / cyan with magnetic orange filaments
    vec3 synch_blue = vec3( 0.15, 0.8, 1.0 );
    vec3 wisp_amber = vec3( 1.0, 0.55, 0.15 );
    vec3 pulsar_white = vec3( 1.0, 0.95, 0.9 );

    vec3 col_synch = palTint( mix( synch_blue, wisp_amber, clamp( wisps + 0.5, 0.0, 1.0 ) ),
                              r_torus * 0.3 + audioCentroid, 0.26 );

    // Background photo sampling
    vec2 bg_uv = gl_FragCoord.xy / resolution;
    vec3 bg = img( bg_uv ) * 0.25;

    vec3 col = bg;
    col += col_synch * torus_ring * ( synchGlowP > 0.01 ? synchGlowP : 1.3 ) * ( 0.85 + 0.35 * audioSwell ) * 2.2;
    col += col_synch * abs( wisps ) * 1.4;
    col += palTint( vec3( 0.4, 0.9, 1.0 ), abs( uv.y ) * 0.3, 0.22 ) * polar_jet * 1.8;
    col += pulsar_white * beam * 2.5;
    col += pulsar_white * core * 3.0;
    col += col_synch * ( audioKick * 0.35 );

    // Soft knee compression
    col /= 1.0 + 0.35 * max( col.r, max( col.g, col.b ) );
    col /= 1.0 + 0.60 * max( col.r, max( col.g, col.b ) ); // peak knee: tame local glare, keep midtones
    fragColor = vec4( clamp( col, 0.0, 1.0 ), 1.0 );
}
