#version 330 core
/*****************************************************************************\
 *                              AtmosphericGravityWaveUndularBore.vert
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Vertex stage companion to AtmosphericGravityWaveUndularBore.frag -- see that file's header for this scene's
 *  description.
 *
 *  @author René Weller
 */

in vec4 attrA; ///< xy = Cell UV [0,1], z = 0, w = Cell index
in vec4 attrB; ///< 4 seeds in [0,1)

out vec2  vUV;      ///< Texture coordinate 0..1 over the screen (from the vertex stage).
out vec3  vNormal;  ///< Surface normal (from the vertex stage).
out vec3  vCol;     ///< Colour (from the vertex stage).
out float vAirglow; ///< Airglow (from the vertex stage).

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

uniform float boreWaveP; ///< Bore wave knob, 6..18.
uniform float airglowP;  ///< Airglow knob, 0.8..2.5.

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

    float t = time * 0.35 + audioAdvance * 0.3;

    // Mesospheric undular bore gravity wave train
    float bore_freq = ( boreWaveP > 0.01 ? boreWaveP : 10.0 );
    float wave_phase = uv.y * bore_freq - t * 2.5;

    // Non-linear cnoidal wave soliton train
    float wave_crest = pow( sin( wave_phase ) * 0.5 + 0.5, 3.0 );
    float wave_height = wave_crest * 0.35 * ( 1.0 + 0.4 * audioSwell );

    // Atmospheric curvature (spherical shell)
    float r2 = dot( uv, uv );
    float earth_curv = -r2 * 0.45;

    vec3 world_pos = vec3( uv.x * 3.2, uv.y * 3.2, earth_curv + wave_height );

    // Surface normal
    float d_hdy = cos( wave_phase ) * 0.4;
    vNormal = normalize( vec3( 0.0, -d_hdy, 1.0 ) );

    // Mesospheric hydroxyl chemiluminescence (airglow emerald green)
    float airglow = wave_crest * ( 1.0 + 2.0 * audioKick );
    vAirglow = airglow;

    vec3 airglow_green = vec3( 0.15, 0.95, 0.45 );
    vCol = palTint( airglow_green, attrA.y * 0.4 + audioCentroid, 0.26 );

    // Camera Transform (V3)
    vec3 vp = world_pos;
    vp.z += 4.5;
    vp.x -= eyeOff;

    // Isometric tilt looking across atmosphere
    float tilt = 0.55;
    float c = cos( tilt ), s = sin( tilt );
    vp = vec3( vp.x, vp.y * c - vp.z * s, vp.y * s + vp.z * c );

    gl_Position = projM * vec4( vp.x, vp.y, -vp.z, 1.0 );
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
