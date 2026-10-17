#version 330 core
/*****************************************************************************\
 *                              HopfFibrationToruses.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Shades one fiber of a Hopf-fibration torus arrangement (Villarceau circles) as a glowing strand with a soft
 *  cross-section falloff (cross_edge) and a light pulse that visibly travels along the fiber over time.
 *
 *  Each fiber's chromatic hue comes from the photo-arc palette (imgPalette)
 *  offset by its fiber ID (vFiberID) and audioPhase, so the phase of the
 *  music shifts which color sits where along the fibration; the per-vertex
 *  vEnergy supplied by the companion vertex shader scales overall
 *  brightness, and glowP scales it further. The palette's arc also carries
 *  an audioAdvance drift and audioValence-controlled saturation.
 *
 *  @author René Weller
 */
in vec3  vPos;     ///< Position (from the vertex stage).
in vec2  vUV;      ///< Texture coordinate 0..1 over the screen (from the vertex stage).
in float vFiberID; ///< Fiber ID (from the vertex stage).
in float vEnergy;  ///< Energy (from the vertex stage).

out vec4 fragColor; ///< The pixel's colour (output).

uniform float     time;          ///< Seconds since this activation, plus a rolled start (see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioPhase;   ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance; ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                            ///< backwards).
uniform float audioKick;    ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioBass;    ///< Bass band level, 0..1.
uniform float audioMid;     ///< Mid band level, 0..1.
uniform float audioHigh;    ///< High band level, 0..1.
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).

uniform float glowP;  ///< Glow / afterglow knob, 0..1.
uniform float widthP; ///< Width knob, 0..1.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.


uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.

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


/**  IMG-PALETTE (house standard): colours come from a rotating arc in the CURRENT slideshow image, so every
 * activation inherits a fresh palette from the photos; the arc follows the musical key (audioChromaHue is circular-
 * slewed = jump-free) with a slow advance drift, valence shapes saturation.
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
    vec3  pc = img( clamp( vec2( 0.5 ) + rad * vec2( cos( ang ), sin( ang ) ), 0.0, 1.0 ) );
    float pg = dot( pc, vec3( 0.333 ) );
    return mix( vec3( pg ), pc, 0.55 + 0.45 * audioValence );
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

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float glw = ( glowP > 0.0 ) ? glowP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    // Edge fading along ribbon cross-section
    float cross_edge = smoothstep( 0.5, 0.1, abs( vUV.y - 0.5 ) );

    // Hopf fiber chromatic spectrum
    vec3 fiber_color = imgPalette( vFiberID + audioPhase * 0.159 );

    // Light pulses traveling along Villarceau circle fibers
    float speed_pulse = 0.5 + 0.5 * sin( vUV.x * 30.0 - time * 10.0 );
    fiber_color = mix( fiber_color, vec3( 1.0, 0.9, 0.7 ), speed_pulse * 0.6 );

    vec3 col = fiber_color * vEnergy * cross_edge * glw;

    if ( hue > 0.001 )
        col = hueRot( col, hue );

    fragColor = vec4( col, cross_edge * 0.9 );
}
