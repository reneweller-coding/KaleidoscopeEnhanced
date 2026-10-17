#version 330 core
/*****************************************************************************\
 *                              CherenkovRadiationWakefield.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  CHERENKOV RADIATION WAKEFIELD: Relativistic charged particle wakefield traversing a dense dielectric medium.
 *
 *  Emits superluminal Cherenkov shockwave cones, plasma bubble cavitation cavities, travelling optical Mach
 *  fringes, and photo-driven dielectric polarization glow.
 *
 *    audioAdvance -> drives relativistic particle beam & shockwave propagation
 *    audioKick    -> triggers high-gradient plasma cavitation detonations
 *    audioCentroid-> modulates Cherenkov cone opening angle & optical dispersion
 *    audioSwell   -> intensifies background dielectric polarization glow
 *    audioSubBass -> pulses plasma wakefield bubble diameter
 *
 *  Per-activation variety:
 *    machP    float Cherenkov Mach angle & dispersion       (0.6..1.8)
 *    bubbleP  float plasma wakefield cavity scale           (0.5..2.0)
 *    fringeP  float optical interference fringe density     (1.0..3.5)
 *    glowP    float dielectric polarization luminance       (0.8..2.5)
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

uniform float machP;   ///< Mach knob: Cherenkov Mach angle & dispersion, 0.6..1.8.
uniform float bubbleP; ///< Bubble knob: plasma wakefield cavity scale, 0.5..2.
uniform float fringeP; ///< Fringe knob: optical interference fringe density, 1..3.5.
uniform float glowP;   ///< Glow / afterglow knob, 0..1.

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

    // Beam axis & coordinate transformation
    vec2 p = uv;
    p.y += sin( p.x * 2.5 + t * 0.8 ) * 0.08;

    float beam_pos = fract( t * 0.3 ) * 3.0 - 1.5;
    float dx = p.x - beam_pos;
    float r = abs( p.y );

    // Cherenkov cone geometry (Mach angle)
    float mach_angle = ( 0.75 + 0.25 * sin( audioCentroid * 3.14 ) ) * ( machP > 0.01 ? machP : 1.0 );
    float cone_d = dx * mach_angle - r;
    float in_cone = smoothstep( 0.0, 0.15, cone_d );

    // Plasma wakefield cavitation bubbles
    float bubble_freq = 5.0 * ( bubbleP > 0.01 ? bubbleP : 1.0 );
    float bubble_phase = dx * bubble_freq + t * 4.0;
    float bubble_cavity = exp( -r * ( 6.0 - 2.0 * audioSubBass ) ) * ( 0.5 + 0.5 * cos( bubble_phase ) );

    // Optical Mach fringes & high-gradient interference
    float fringe_density = 18.0 * ( fringeP > 0.01 ? fringeP : 1.5 );
    float fringes = sin( cone_d * fringe_density + audioPhase * 2.0 ) * 0.5 + 0.5;
    fringes *= in_cone * exp( -max( 0.0, -dx ) * 0.8 );

    // Core ionization spark
    float spark = exp( -dot( vec2( dx, p.y ), vec2( dx, p.y ) ) * 45.0 ) * ( 1.0 + 3.0 * audioKick );

    // Dielectric background polarization
    vec2 bg_uv = gl_FragCoord.xy / resolution;
    vec3 photo_bg = img( bg_uv );

    // Color synthesis: Deep Cherenkov blue-violet identity tinted with photo palette
    vec3 cherenkov_blue = vec3( 0.08, 0.45, 1.0 );
    vec3 violet_glow = vec3( 0.55, 0.15, 0.95 );
    vec3 shock_tint = palTint( mix( cherenkov_blue, violet_glow, fringes ), cone_d * 0.2, 0.28 );

    vec3 col = photo_bg * 0.25;
    col += shock_tint * ( in_cone * 0.8 + fringes * 0.6 ) * ( glowP > 0.01 ? glowP : 1.2 );
    col += palTint( vec3( 0.2, 0.8, 1.0 ), dx * 0.1, 0.25 ) * bubble_cavity * ( 0.8 + 0.6 * audioSwell );
    col += vec3( 0.8, 0.95, 1.0 ) * spark;

    // Kick flash
    col += shock_tint * audioKick * 0.35;

    // Soft knee compression
    col /= 1.0 + 0.35 * max( col.r, max( col.g, col.b ) );
    fragColor = vec4( clamp( col, 0.0, 1.0 ), 1.0 );
}
