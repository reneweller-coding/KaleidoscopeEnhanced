#version 330 core
/*****************************************************************************\
 *                              FluidChladniKaleidoResonance.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  FLUID CHLADNI KALEIDO RESONANCE: Acoustic standing wave modal nodal lines coupled with viscous iridescent fluid
 *  marbling and kaleidoscopic rotational symmetry.
 *
 *  Audio Reactivity:
 *    audioAdvance -> drives continuous fluid curl advection & modal transitions
 *    audioKick    -> excites higher-order vibration harmonics & nodal line shockwaves
 *    audioCentroid-> selects Chladni modal quantum numbers (m, n)
 *    audioSubBass -> drives viscous fluid ripple turbulence & amplitude
 *    audioChromaHue-> rotates the iridescent thin-film fluid palette
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
uniform float audioSubBass;   ///< Sub-bass band level, 0..1.
uniform float audioBass;      ///< Bass band level, 0..1.
uniform float audioMid;       ///< Mid band level, 0..1.
uniform float audioHigh;      ///< High band level, 0..1.
uniform float audioFlux;      ///< Spectral flux (how fast the spectrum changes), 0..1.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

// Per-activation variety
uniform float speedP;     ///< Speed knob, 0..1.
uniform float modeP;      ///< Mode knob, 1..4.
uniform float viscosityP; ///< Viscosity knob, 0.7..1.5.
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

/**  2D Curl noise field for viscous fluid advection
 *
 * @param p  The point. (in)
 * @param t  Phase of the field. (in)
 *
 * @return
 *   The flow vector.
 **/
vec2 curlNoise( vec2 p, float t )
{
    float n1 = sin( p.y * 3.5 + t * 0.8 ) + cos( p.x * 2.5 - t * 0.5 );
    float n2 = cos( p.x * 3.5 + t * 0.7 ) - sin( p.y * 2.5 - t * 0.6 );
    return vec2( n1, n2 ) * 0.2;
}

/**  Chladni 2D nodal function: a*sin(n*pi*x)*sin(m*pi*y) - b*sin(m*pi*x)*sin(n*pi*y)
 *
 * @param p      The point. (in)
 * @param n      First mode number. (in)
 * @param m      Second mode number. (in)
 * @param ratio  Weight of the second term. (in)
 *
 * @return
 *   The nodal function's value (0 on the nodal lines).
 **/
float chladni2D( vec2 p, float n, float m, float ratio )
{
    float pi = 3.14159265;
    float term1 = sin( n * pi * p.x ) * sin( m * pi * p.y );
    float term2 = sin( m * pi * p.x ) * sin( n * pi * p.y );
    return term1 - ratio * term2;
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution.xy ) / min( resolution.x, resolution.y );

    float spd = ( speedP > 0.01 ) ? speedP : 1.0;
    float visc = ( viscosityP > 0.01 ) ? viscosityP : 1.0;
    float glw = ( glowP > 0.01 ) ? glowP : 1.0;

    float t = time * 0.168 * spd + audioAdvance * 0.168 * spd;
    // Zeit-Basis + Musik-Schub: audioAdvance ALLEIN steht bei ruhiger
    // Musik still (die gemeldete "wirkt wie ein Bild"-Klasse).

    // 8-Fold rotational symmetry fold for kaleidoscope
    float ang = atan( uv.y, uv.x );
    float rad = length( uv );
    float seg = 3.14159265 / 4.0;
    ang = mod( ang + seg * 0.5, seg ) - seg * 0.5;
    ang = abs( ang );
    vec2 p_sym = vec2( cos( ang ), sin( ang ) ) * rad;

    // Viscous fluid advection over 3 iterative passes
    vec2 p_fluid = p_sym;
    for ( int k = 0; k < 3; ++k )
    {
        vec2 curl = curlNoise( p_fluid * 2.5, t + float( k ) * 1.5 );
        p_fluid += curl * ( 0.18 * visc + 0.12 * audioSubBass );
    }

    // Modal frequencies selected by audio centroid and per-activation mode
    float n_mod = 2.0 + floor( ( modeP * 3.0 + audioCentroid * 4.0 ) );
    float m_mod = n_mod + 1.0 + floor( audioFlux * 2.0 );
    float modal_ratio = 0.95 + 0.3 * sin( t * 0.7 );

    // Compute acoustic vibration field
    float chladni_val = chladni2D( p_fluid, n_mod, m_mod, modal_ratio );
    float nodal_dist = abs( chladni_val );

    // Glowing nodal lines (sand particles gathering at zero-amplitude vibration lines)
    float nodal_glow = exp( -nodal_dist * ( 28.0 + 15.0 * audioCentroid ) ) * glw;

    // Sample warped texture along fluid marble stream
    vec2 sample_uv = fract( p_fluid * 0.5 + 0.5 );
    vec3 tex_col = img( sample_uv );

    // Iridescent interference colors across Chladni gradients
    float phase = chladni_val * 4.0 + t * 2.0;
    vec3  pal_a = imgPalette( phase * 0.1 );
    vec3  pal_b = imgPalette( phase * 0.1 + 0.5 );
    vec3  fluid_col = mix( pal_a, pal_b, 0.5 + 0.5 * sin( phase ) );

    fluid_col = mix( fluid_col, tex_col, 0.35 + 0.15 * audioValence );

    // Add neon nodal particle lines with kick flash
    vec3 neon_nodal = vec3( 1.3, 1.0, 1.7 ) * nodal_glow * ( 1.0 + 3.0 * audioKick );
    fluid_col += neon_nodal;

    // Specular liquid ridge highlights
    float ridge = pow( clamp( 1.0 - nodal_dist * 4.0, 0.0, 1.0 ), 4.0 );
    fluid_col += vec3( 1.0, 1.1, 1.3 ) * ridge * 0.6 * audioLevel;

    // Contrast & vignette
    fluid_col = pow( fluid_col, vec3( 0.86 ) );
    float vig = 1.0 - smoothstep( 0.85, 1.4, rad );
    fluid_col *= vig;

    fragColor = vec4( clamp( fluid_col, 0.0, 1.0 ), 1.0 );
}
