#version 330 core
/*****************************************************************************\
 *                              NonlinearKerrOpticalSolitonCollision.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  NONLINEAR KERR OPTICAL SOLITON COLLISION: Spatial optical solitons in a self-focusing Kerr medium.
 *
 *  Stable self-trapped wavepackets undergo elastic and inelastic collisions, generating four-wave mixing fringes,
 *  dispersive shock waves, and photo-derived optical spectra.
 *
 *    audioAdvance -> propels spatial soliton trajectories towards collision center
 *    audioKick    -> flashes nonlinear four-wave mixing energy peak detonation
 *    audioSwell   -> thickens self-focusing Kerr waveguide channel width
 *    audioCentroid-> shifts self-phase modulation dispersion colors
 *    audioMid     -> excites dispersive radiation ripples escaping the collision
 *
 *  Per-activation variety:
 *    solitonCountP float number of converging optical solitons     (2.0..6.0)
 *    kerrNonlinP   float nonlinear self-focusing intensity        (0.6..2.2)
 *    shockP        float dispersive shockwave ripple frequency    (8.0..24.0)
 *    crossPhaseP   float cross-phase modulation interaction scale (0.5..2.0)
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

uniform float solitonCountP; ///< Soliton count knob: number of converging optical solitons, 2..6.
uniform float kerrNonlinP;   ///< Kerr nonlin knob: nonlinear self-focusing intensity, 0.6..2.2.
uniform float shockP;        ///< Shock knob: dispersive shockwave ripple frequency, 8..24.
uniform float crossPhaseP;   ///< Cross phase knob: cross-phase modulation interaction scale (0.5..2.0).

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
    vec2  uv = ( gl_FragCoord.xy - 0.5 * resolution ) / min( resolution.x, resolution.y );
    float t = time * 0.45 + audioAdvance * 0.35;

    float num_solitons = ( solitonCountP > 1.0 ? solitonCountP : 4.0 );
    float kerr = ( kerrNonlinP > 0.01 ? kerrNonlinP : 1.3 ) * ( 0.8 + 0.4 * audioSwell );

    vec3  acc_col = vec3( 0.0 );
    float total_intensity = 0.0;

    // Simulate multiple colliding sech(x) spatial solitons
    for ( float i = 0.0; i < 4.0; i += 1.0 )
    {
        if ( i >= num_solitons )
            break;

        float angle = i * ( 6.2831853 / num_solitons ) + audioPhase * 0.2;
        vec2  dir = vec2( cos( angle ), sin( angle ) );
        vec2  normal = vec2( -sin( angle ), cos( angle ) );

        // Oscillating trajectory passing through origin
        float progress = sin( t * 0.8 + i * 1.57 );
        vec2  soliton_center = dir * ( progress * 0.85 );

        vec2  diff = uv - soliton_center;
        float long_dist = dot( diff, dir );
        float perp_dist = dot( diff, normal );

        // Sech(x) envelope profile: 1 / cosh(x)
        float envelope = 1.0 / cosh( perp_dist * 9.0 * kerr );
        float pulse = exp( -long_dist * long_dist * 16.0 );

        float sol_intensity = envelope * pulse;
        total_intensity += sol_intensity;

        // Self-phase modulation carrier wave
        float spm_phase = long_dist * 20.0 + t * 4.0 * ( 1.0 + i * 0.2 );
        float carrier = sin( spm_phase ) * 0.5 + 0.5;

        vec3 sol_col = imgPalette( fract( i * 0.25 + t * 0.05 + audioCentroid ) );
        acc_col += sol_col * sol_intensity * ( 0.6 + 0.4 * carrier );
    }

    // Four-wave mixing & nonlinear collision core flash (at origin)
    float r = length( uv );
    float collision_core = exp( -r * r * 25.0 ) * pow( total_intensity, 1.8 ) * ( 1.0 + 4.0 * audioKick );

    // Dispersive shock wave radiation ripples
    float shock_freq = ( shockP > 0.01 ? shockP : 14.0 );
    float shock_waves = sin( r * shock_freq - t * 5.0 ) * exp( -r * 2.5 ) * ( 0.4 + 1.2 * audioMid );

    // Background photo sampling
    vec2 bg_uv = gl_FragCoord.xy / resolution;
    vec3 bg = img( bg_uv ) * 0.25;

    vec3 col = bg;
    col += acc_col * 1.8;
    col += imgPalette( t * 0.1 ) * collision_core * 2.5;
    col += imgPalette( fract( r * 0.3 + 0.5 ) ) * abs( shock_waves ) * 1.5;
    col += imgPalette( audioCentroid ) * ( audioKick * 0.35 );

    // Soft knee compression
    col /= 1.0 + 0.35 * max( col.r, max( col.g, col.b ) );
    fragColor = vec4( clamp( col, 0.0, 1.0 ), 1.0 );
}
