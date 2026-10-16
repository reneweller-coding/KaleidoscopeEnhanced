#version 330 core
/*****************************************************************************\
 *                              QuantumChromodynamicsGluonPlasma.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  QUANTUM CHROMODYNAMICS GLUON PLASMA: 100% viewport-filling relativistic heavy-ion collision simulation (RHIC /
 *  CERN LHC).
 *
 *  Ultra-high temperature deconfined quark-gluon fireball with SU(3) non-abelian color flux tubes, asymptotic
 *  freedom string breaking, and gluon Cherenkov radiation.
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).

uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioPhase;        ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;      ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                                 ///< backwards).
uniform float audioSwell;        ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;        ///< Overall loudness, 0..1.
uniform float audioKick;         ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioCentroid;     ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;      ///< Mood valence: 0 dark .. 1 bright.
uniform float audioSubBass;      ///< Sub-bass band level, 0..1.
uniform float audioBass;         ///< Bass band level, 0..1.
uniform float audioMid;          ///< Mid band level, 0..1.
uniform float audioHigh;         ///< High band level, 0..1.
uniform float audioFlux;         ///< Spectral flux (how fast the spectrum changes), 0..1.
uniform float audioChromaHue;    ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioSpectrum[32]; ///< Spectrum bands, 0..1.

uniform float plasmaP; ///< Plasma knob, 0.5..2.2.
uniform float stringP; ///< String knob, 0.5..2.
uniform float speedP;  ///< Speed knob, 0..1.
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

/**  Rotates a colour's hue by an angle (about the grey axis).
 *
 * @param c  The colour. (in)
 * @param a  The angle in radians. (in)
 *
 * @return
 *   The colour with its hue turned.
 **/
vec3 hueRot( vec3 c, float a )
{
    vec3  k = vec3( 0.57735026919 );
    float cs = cos( a ), sn = sin( a );
    return c * cs + cross( k, c ) * sn + k * dot( k, c ) * ( 1.0 - cs );
}

/**  SU(3) Color charge matrix helper (Red, Green, Blue color states)
 *
 * @param p  The point. (in)
 * @param t  Time. (in)
 *
 * @return
 *   The three colour charges, each 0..1.
 **/
vec3 su3ColorField( vec2 p, float t )
{
    float r = sin( p.x * 6.0 + p.y * 4.0 + t * 2.0 );
    float g = sin( p.x * 4.0 - p.y * 6.0 - t * 1.5 + 2.094 );
    float b = sin( -p.x * 5.0 - p.y * 5.0 + t * 2.5 + 4.188 );
    return vec3( r, g, b ) * 0.5 + 0.5;
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float pls = ( plasmaP > 0.0 ) ? plasmaP : 1.0;
    float str = ( stringP > 0.0 ) ? stringP : 1.0;
    float spd = ( speedP > 0.0 ) ? speedP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;

    float t = time * 0.35 * spd + audioAdvance * 0.2;
    float r = length( uv );
    float angle = atan( uv.y, uv.x );

    // Relativistic fireball expansion shockwave
    float fireball_r = ( 0.7 + 0.3 * sin( t * 0.8 ) ) * ( 1.0 + 0.4 * audioBass );
    float fireball_mask = smoothstep( fireball_r + 0.2, fireball_r - 0.1, r );

    // SU(3) Non-Abelian color flux tubes
    vec2 flux_uv = uv * ( 4.0 * str );
    vec3 su3 = su3ColorField( flux_uv, t );

    // Color string tension & string-breaking vortex pinch
    float string_tension = sin( uv.x * 12.0 + sin( uv.y * 8.0 + t ) * 2.0 );
    float string_break = exp( -abs( string_tension ) * 8.0 ) * ( 0.8 + 1.2 * audioHigh );

    // Deconfined quark trajectories advected through gluon field
    vec2 quark_pos1 = uv + vec2( cos( t * 1.2 ), sin( t * 1.5 ) ) * 0.25;
    vec2 quark_pos2 = uv + vec2( cos( t * 0.9 + 2.0 ), sin( t * 1.1 + 1.0 ) ) * 0.3;
    vec2 quark_pos3 = uv + vec2( sin( t * 1.4 + 4.0 ), cos( t * 0.8 + 3.0 ) ) * 0.35;

    float q1 = exp( -dot( quark_pos1, quark_pos1 ) * 30.0 );
    float q2 = exp( -dot( quark_pos2, quark_pos2 ) * 30.0 );
    float q3 = exp( -dot( quark_pos3, quark_pos3 ) * 30.0 );
    float quark_glow = ( q1 + q2 + q3 ) * ( 1.5 + 2.5 * audioKick );

    // Photo texture embedded into the deconfined color fields
    vec2 photo_uv = uv * 0.5 + vec2( 0.5 ) + ( su3.xy - 0.5 ) * 0.1;
    vec3 photo_plasma = img( fract( photo_uv ) );

    // High-temperature QCD colors: 4 Trillion Kelvin Fireball White/Magenta/Cyan
    vec3 qcd_white = vec3( 1.0, 0.98, 0.95 ) * 3.0;
    vec3 qcd_magenta = vec3( 1.0, 0.05, 0.6 ) * 2.0;
    vec3 qcd_cyan = vec3( 0.0, 0.85, 1.0 ) * 2.0;

    vec3 plasma_col = mix( qcd_cyan, qcd_magenta, su3.r );
    plasma_col = mix( plasma_col, qcd_white, fireball_mask * ( 0.5 + 0.5 * audioKick ) );

    // Collision burst on kick
    float collision_burst = exp( -r * 3.0 ) * ( audioKick * 3.0 + audioSubBass * 1.5 );

    vec3 col = photo_plasma * ( plasma_col * 0.8 + 0.2 ) * pls;
    col += plasma_col * string_break * 1.5;
    col += vec3( 1.0, 0.9, 0.5 ) * quark_glow * 1.5;
    col += qcd_white * collision_burst;

    col = hueRot( col, audioChromaHue + hue );
    col = pow( col, vec3( 0.85 ) ); // High contrast boost
    col += vec3( 0.04, 0.02, 0.06 ) * audioSwell;

    // Catalogue review: soft-knee exposure — hot audio compresses
    // instead of clipping the whole frame to white.
    vec3 cat_tone = ( col ) * 0.26;
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( cat_tone, 1.0 );
}
