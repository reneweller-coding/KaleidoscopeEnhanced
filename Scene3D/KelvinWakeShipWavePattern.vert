#version 330 core
/*****************************************************************************\
 *                              KelvinWakeShipWavePattern.vert
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Vertex stage companion to KelvinWakeShipWavePattern.frag -- see that file's header for this scene's description.
 *
 *  @author René Weller
 */

in vec4 attrA; ///< xy = Cell UV [0,1], z = 0, w = Cell index
in vec4 attrB; ///< 4 seeds in [0,1)

out vec2  vUV;        ///< Texture coordinate 0..1 over the screen (from the vertex stage).
out vec3  vNormal;    ///< Surface normal (from the vertex stage).
out vec3  vCol;       ///< Colour (from the vertex stage).
out float vCrestGlow; ///< Crest glow (from the vertex stage).

uniform mat4  projM;  ///< Projection matrix.
uniform float eyeOff; ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).

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

uniform float waveScaleP; ///< Wave scale knob, 0.6..2.2.

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
    // Remap grid UV [0,1] to centered [-1,1] domain
    vec2 uv = attrA.xy * 2.0 - 1.0;
    vUV = attrA.xy;

    float t = time * 0.4 + audioAdvance * 0.35;

    // Ship moving along -y axis with classical Kelvin wake pattern
    // Characteristic Kelvin wedge angle: arcsin(1/3) = 19.47 degrees
    float x = uv.x * 2.8;
    float y = uv.y * 2.8;

    // Divergent wave system (echelon waves)
    float theta_kelvin = 0.3398369; // 19.47 degrees in radians
    float wake_cone = abs( x ) - max( 0.0, -y ) * tan( theta_kelvin );

    // Transverse and divergent wave phases
    float k_trans = 12.0 * ( waveScaleP > 0.01 ? waveScaleP : 1.0 );
    float trans_wave = cos( y * k_trans - t * 4.0 ) * exp( -abs( x ) * 2.0 );

    float k_div = 18.0;
    float div_wave = cos( ( abs( x ) * 2.0 + y ) * k_div - t * 6.0 ) * smoothstep( 0.1, -0.1, wake_cone );

    float total_wave_height = ( trans_wave * 0.4 + div_wave * 0.6 ) * 0.22 * ( 0.85 + 0.35 * audioSwell );

    vec3 world_pos = vec3( x, y, total_wave_height );

    // Wave crest spray / foam illumination
    float crest = pow( clamp( total_wave_height * 4.0 + 0.3, 0.0, 1.0 ), 3.0 );
    vCrestGlow = crest * ( 1.0 + 3.0 * audioKick );

    // Approximate surface normal
    float d_hdx = -sin( ( abs( x ) * 2.0 + y ) * k_div - t * 6.0 ) * 0.3;
    float d_hdy = -sin( y * k_trans - t * 4.0 ) * 0.2;
    vNormal = normalize( vec3( -d_hdx, -d_hdy, 1.0 ) );

    // Ocean blue palette
    vec3 ocean_blue = vec3( 0.08, 0.45, 0.75 );
    vCol = palTint( ocean_blue, attrA.y * 0.3 + audioCentroid, 0.25 );

    // Camera Transform (V3)
    // Tilt FIRST, then push away.  The old order rotated the already-pushed
    // plate about the CAMERA, which dropped the plate's centre by D*sin(tilt)
    // and left it sitting in the lower half of the frame with black above.
    // Tilting about the plate's own centre keeps it on the view axis, and at
    // this distance it then fills the frame (reported: "bildschirmfuellender").
    vec3  vp = world_pos;
    float tilt = 0.65;
    float c = cos( tilt ), s = sin( tilt );
    vp = vec3( vp.x, vp.y * c - vp.z * s, vp.y * s + vp.z * c );
    vp.z += 3.0;
    vp.x -= eyeOff;

    gl_Position = projM * vec4( vp.x, vp.y, -vp.z, 1.0 );
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
