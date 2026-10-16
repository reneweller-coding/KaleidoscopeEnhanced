#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file LaserCavityTransverseModes.frag
 * @brief LASER CAVITY TRANSVERSE MODES: Higher-order Hermite-Gaussian (TEM_mn) and
 * Laguerre-Gaussian (LG_l^p) laser cavity resonator transverse modes carrying orbital
 * angular momentum. Geometrical laser petal flowers, phase vortices, and resonant cavity flares.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous orbital angular momentum phase rotation
 *   audioKick    -> flashes laser cavity mode nodes & triggers mode index hopping
 *   audioCentroid-> modulates transverse mode indices (m, n) & radial petal count
 *   audioSubBass -> expands laser beam waist radius w0 breathing
 *   audioChromaHue-> rotates the monochromatic laser emission spectrum
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
uniform float speedP;     ///< Speed knob, 0..1.
uniform float modeIndexP; ///< Mode index knob, 2..6.
uniform float waistP;     ///< Waist knob, 0.3..0.6.
uniform float glowP;      ///< Glow / afterglow knob, 0..1.
uniform float hueP;       ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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
    float m_idx = ( modeIndexP > 1.0 ) ? modeIndexP : 4.0;
    float w0 = ( waistP > 0.01 ) ? waistP : 0.45;
    float glw = ( glowP > 0.01 ) ? glowP : 1.0;

    float t = time * 0.192 * spd + audioAdvance * 0.192 * spd;
    // Zeit-Basis + Musik-Schub: audioAdvance ALLEIN steht bei ruhiger
    // Musik still (die gemeldete "wirkt wie ein Bild"-Klasse).

    // Laser beam waist radius w(z) with breathing
    float beam_waist = w0 * ( 1.0 + 0.15 * sin( audioSwell * 2.5 ) + 0.1 * audioSubBass );

    float r = length( uv ) / max( 0.01, beam_waist );
    float a = atan( uv.y, uv.x );

    // Laguerre-Gaussian mode LG_l^p with orbital angular momentum l and radial nodes p
    float l_oam = floor( m_idx + 2.0 * audioCentroid );
    float p_radial = 2.0;

    // Laguerre polynomial approximation: L_p^l(2*r^2)
    float r2 = 2.0 * r * r;
    float laguerre = 1.0 - r2 + ( r2 * r2 ) * 0.25;

    // Mode field amplitude: (r*sqrt(2))^l * L_p^l(2*r^2) * exp(-r^2) * cos(l*a - GouyPhase)
    float gouy_phase = t * 2.0 + audioPhase * 0.1;
    float mode_amp = pow( max( 0.01, r * 1.4142 ), l_oam * 0.3 ) * laguerre * exp( -r * r )
                     * cos( l_oam * a - gouy_phase );

    // Laser intensity: I = |E|^2
    float intensity = mode_amp * mode_amp;

    // Sample distorted background photo
    vec2 sample_uv = fract( uv * 0.4 + vec2( mode_amp * 0.08 ) + 0.5 );
    vec3 tex_col = img( sample_uv );

    // Monochromatic / multi-spectral laser cavity palette
    vec3 pal_laser = imgPalette( intensity * 1.5 + 0.2 );
    vec3 base_col = mix( tex_col * 0.25, pal_laser, 0.45 );

    // Glowing laser mode petals & nodal lines
    float petal_glow = exp( -abs( mode_amp ) * 1.5 ) * intensity * ( 1.0 + 3.0 * audioKick ) * glw;
    vec3  laser_tint = vec3( 1.4, 1.2, 1.9 ) * petal_glow * 2.5;

    vec3 final_col = base_col + laser_tint;

    // Center optical vortex singularity core
    float vortex_core = exp( -r * 8.0 ) * ( 0.8 + 1.5 * audioKick );
    final_col += imgPalette( 0.85 ) * vortex_core;

    final_col = pow( final_col, vec3( 0.88 ) );
    fragColor = vec4( clamp( final_col, 0.0, 1.0 ), 1.0 );
}
