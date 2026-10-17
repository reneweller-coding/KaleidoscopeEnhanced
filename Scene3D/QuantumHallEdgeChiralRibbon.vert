#version 330 core
/*****************************************************************************\
 *                              QuantumHallEdgeChiralRibbon.vert
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Vertex stage companion to QuantumHallEdgeChiralRibbon.frag -- see that file's header for this scene's
 *  description.
 *
 *  @author René Weller
 */

in vec4 attrA; ///< x = t [0,1], y = side (-1/+1), z = 0, w = ribbon index
in vec4 attrB; ///< 4 seeds in [0,1)

out vec2  vUV;          ///< Texture coordinate 0..1 over the screen (from the vertex stage).
out float vSide;        ///< Which side of a strip (from the vertex stage).
out float vRibbonID;    ///< Ribbon ID (from the vertex stage).
out vec3  vCol;         ///< Colour (from the vertex stage).
out float vChiralPulse; ///< Chiral pulse (from the vertex stage).

uniform mat4  projM;  ///< Projection matrix.
uniform float eyeOff; ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since this activation, plus a rolled start (see sceneTime).

uniform float audioPhase;     ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                              ///< backwards).
uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSwell;     ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioCentroid;  ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float ribbonWidthP;  ///< Ribbon width knob, 0.02..0.1.
uniform float edgeSpeedP;    ///< Edge speed knob, 0.6..2.5.
uniform float landauRadiusP; ///< Landau radius knob, 0.6..1.6.

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
    float t_coord = attrA.x;
    float side = attrA.y;
    float r_index = attrA.w;

    vSide = side;
    vRibbonID = r_index;
    vUV = vec2( t_coord, side * 0.5 + 0.5 );

    float t = time * 0.35 + audioAdvance * 0.3;
    float v_speed = ( edgeSpeedP > 0.01 ? edgeSpeedP : 1.2 );

    // Nested concentric chiral edge states for different Landau levels (nu = 1, 2, 3, ...)
    float landau_level = r_index + 1.0;
    float base_r = ( 0.4 + landau_level * 0.22 ) * ( landauRadiusP > 0.01 ? landauRadiusP : 1.0 );

    // Chiral perimeter trajectory around 2D electron gas island
    float perimeter_angle = t_coord * 6.2831853 + t * v_speed * ( 1.0 / sqrt( landau_level ) );

    // Mesoscopic boundary oscillations (skipping orbits along boundary)
    float skip_waves = sin( t_coord * 24.0 * landau_level - t * 4.0 ) * 0.04;
    float current_r = base_r + skip_waves;

    float z_layer = ( landau_level - 3.0 ) * 0.15 + sin( perimeter_angle * 3.0 + t * 0.5 ) * 0.08;

    vec3 center_pos = vec3(
        cos( perimeter_angle ) * current_r,
        sin( perimeter_angle ) * current_r,
        z_layer );

    vec3 tangent = normalize( vec3( -sin( perimeter_angle ), cos( perimeter_angle ), 0.0 ) );
    vec3 binormal = normalize( cross( tangent, vec3( 0.0, 0.0, 1.0 ) ) );

    float width = ( ribbonWidthP > 0.001 ? ribbonWidthP : 0.045 ) * ( 1.0 + 0.3 * audioSwell );
    vec3  world_pos = center_pos + binormal * ( side * width );

    // Chiral 1D ballistic electron wavepacket flash
    float pulse = exp( -abs( fract( t_coord * 4.0 - t * 2.0 * v_speed ) - 0.5 ) * 16.0 ) * ( 1.0 + 3.0 * audioKick );
    vChiralPulse = pulse;

    vCol = imgPalette( fract( r_index * 0.15 + t_coord * 0.2 + audioCentroid ) );

    // Camera Transform (V3)
    vec3 vp = world_pos;
    vp.z += 4.5;
    vp.x -= eyeOff;

    // Perspective tilt
    float tilt = 0.55;
    float c = cos( tilt ), s = sin( tilt );
    vp = vec3( vp.x, vp.y * c - vp.z * s, vp.y * s + vp.z * c );

    gl_Position = projM * vec4( vp.x, vp.y, -vp.z, 1.0 );
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
