#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file RelativisticKerrPlasmaDisk.frag
 * @brief RELATIVISTIC KERR PLASMA DISK: Rotating Kerr black hole accretion disk with
 * Lense-Thirring frame dragging, relativistic Doppler beaming (approaching side blueshifted
 * and super-bright), gravitational lensing light arcs, and inner ISCO plasma turbulence.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous Kerr black hole spin & plasma accretion rotation
 *   audioKick    -> flashes ISCO innermost stable circular orbit & plasma flares
 *   audioCentroid-> modulates relativistic accretion disk turbulence frequency
 *   audioSubBass -> expands accretion disk outer radius breathing
 *   audioChromaHue-> steers the relativistic Doppler blueshift / redshift spectrum
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
uniform float audioSubBass;   ///< Sub-bass band level, 0..1.
uniform float audioBass;      ///< Bass band level, 0..1.
uniform float audioMid;       ///< Mid band level, 0..1.
uniform float audioHigh;      ///< High band level, 0..1.
uniform float audioFlux;      ///< Spectral flux (how fast the spectrum changes), 0..1.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

// Per-activation variety
uniform float speedP; ///< Speed knob, 0..1.
uniform float spinP;  ///< Spin knob, 0..1.
uniform float dopplerP;
uniform float glowP; ///< Glow / afterglow knob, 0..1.
uniform float hueP;  ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

/// @brief The photo at a coordinate: the cross-fade of tex0 and tex1.
vec3 img( vec2 uv )
{
    return ( interpolation * texture( tex0, uv ) + ( 1.0 - interpolation ) * texture( tex1, uv ) ).rgb;
}

/// @brief The house palette: a colour of the photo on an arc that turns with the music's hue.
vec3 imgPalette( float t )
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853 + hueP;
    float rad = 0.16 + 0.08 * sin( audioAdvance * 0.013 );
    vec3  pc = img( clamp( vec2( 0.5 ) + rad * vec2( cos( ang ), sin( ang ) ), 0.0, 1.0 ) );
    float pg = dot( pc, vec3( 0.333 ) );
    return mix( vec3( pg ), pc, 0.55 + 0.45 * audioValence );
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution.xy ) / min( resolution.x, resolution.y );

    float spd = ( speedP > 0.01 ) ? speedP : 1.0;
    float a_spin = ( spinP > 0.01 ) ? spinP : 0.95; // Kerr spin parameter near maximal (0.95)
    float d_beaming = ( dopplerP > 0.01 ) ? dopplerP : 1.2;
    float glw = ( glowP > 0.01 ) ? glowP : 1.0;

    float t = time * 0.240 * spd + audioAdvance * 0.240 * spd;
    // Zeit-Basis + Musik-Schub: audioAdvance ALLEIN steht bei ruhiger
    // Musik still (die gemeldete "wirkt wie ein Bild"-Klasse).

    // Tilted accretion disk coordinates: (x, y / cos(inclination))
    vec2  p_disk = uv * vec2( 1.0, 2.2 );
    float r = length( p_disk );
    float a = atan( p_disk.y, p_disk.x );

    // Frame dragging angular velocity: omega = 2*a*M / (r^3 + a^2*r + 2*a^2)
    float omega_drag = ( 2.0 * a_spin ) / ( r * r * r + a_spin * a_spin * r + 0.5 );
    float phi_rot = a - ( omega_drag * 2.0 + t * 3.0 );

    // Accretion disk inner radius (ISCO) and outer envelope
    float r_isco = 0.25;
    float r_outer = 1.1 * ( 1.0 + 0.15 * sin( audioSwell * 2.0 ) ) * ( 1.0 + 0.32 * audioSubBass );
    float disk_mask = smoothstep( r_isco - 0.02, r_isco + 0.05, r ) * smoothstep( r_outer + 0.2, r_outer - 0.1, r );

    // Relativistic Doppler beaming: approaching side (x < 0) boosted by factor (1 + v/c)^4
    float v_orbital = sqrt( 1.0 / max( 0.1, r ) );
    float doppler_factor = pow( 1.0 - ( p_disk.x / max( 0.1, r ) ) * v_orbital * 0.45 * d_beaming, 3.5 );

    // Plasma spiral turbulence. Brightness raises only the RADIAL wave
    // numbers -- the phi_rot factors must stay fixed because phi_rot already
    // carries the t*3.0 spin phase, and scaling that would remap the whole
    // accumulated rotation on every audio change.
    float turb_freq = 1.0 + 0.55 * audioCentroid;
    float plasma_turb = sin( phi_rot * 6.0 + r * 15.0 * turb_freq - t * 4.0 )
                        * cos( phi_rot * 4.0 - r * 8.0 * turb_freq );

    // Sample distorted background photo
    vec2 sample_uv = fract( vec2( phi_rot / 6.2831853 + 0.5, r * 0.5 ) );
    vec3 tex_col = img( sample_uv );

    // Palette with Doppler shift: left side blueshifted (hot white/cyan), right side redshifted (crimson)
    vec3 pal_blueshift = vec3( 0.4, 1.4, 2.0 );
    vec3 pal_redshift = vec3( 1.8, 0.4, 0.2 );
    vec3 pal_base = mix( pal_blueshift, pal_redshift, clamp( ( p_disk.x / max( 0.1, r ) ) * 0.5 + 0.5, 0.0, 1.0 ) );
    pal_base = mix( pal_base, imgPalette( r * 0.5 + 0.1 ), 0.35 );

    vec3 disk_col = mix( tex_col * 0.3, pal_base, 0.5 ) * ( 0.7 + 0.3 * plasma_turb ) * doppler_factor * disk_mask;

    // Photon ring lensing arc (just outside horizon)
    float photon_ring = exp( -abs( r - 0.2 ) * 35.0 ) * ( 1.5 + 3.0 * audioKick ) * glw;

    // Black hole shadow (interior of ISCO)
    float shadow_mask = smoothstep( 0.18, 0.22, r );

    vec3 final_col = disk_col * shadow_mask + vec3( 1.8, 1.7, 2.0 ) * photon_ring;

    // Core ISCO flare
    float isco_glow = exp( -abs( r - r_isco ) * 20.0 ) * ( 0.8 + 2.0 * audioKick );
    final_col += imgPalette( 0.85 ) * isco_glow * shadow_mask;

    final_col = pow( final_col, vec3( 0.88 ) );
    fragColor = vec4( clamp( final_col, 0.0, 1.0 ), 1.0 );
}
