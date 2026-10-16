#version 330 core
/**
 * @file HyperbolicHelicoidCatenaMinimalSheet.vert
 * @brief Vertex stage companion to HyperbolicHelicoidCatenaMinimalSheet.frag -- see that file's
 * header for this scene's description.
 */

in vec4 attrA; ///< xy = Cell UV [0,1], z = 0, w = Cell index
in vec4 attrB; ///< 4 seeds in [0,1)

out vec2  vUV;     ///< Texture coordinate 0..1 over the screen (from the vertex stage).
out vec3  vNormal; ///< Surface normal (from the vertex stage).
out vec3  vCol;    ///< Colour (from the vertex stage).
out float vDeformAngle;

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

uniform float sheetScaleP;
uniform float deformSpeedP;

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
    // Remap grid UV [0,1] to centered [-1,1] domain
    vec2 uv = attrA.xy * 2.0 - 1.0;
    vUV = attrA.xy;

    float t = time * 0.35 + audioAdvance * 0.3;

    // Continuous isometric Bonnet transformation between Catenoid and Helicoid:
    // x(u,v; theta) = cos(theta) * sinh(v)*sin(u) + sin(theta) * cosh(v)*cos(u)
    // y(u,v; theta) = -cos(theta) * sinh(v)*cos(u) + sin(theta) * cosh(v)*sin(u)
    // z(u,v; theta) = u * cos(theta) + v * sin(theta)
    float u = uv.x * 3.14159265;
    float v = uv.y * 1.5;

    float v_speed = ( deformSpeedP > 0.01 ? deformSpeedP : 1.0 );
    float theta_deform = t * 0.8 * v_speed + audioPhase * 0.5;
    vDeformAngle = theta_deform;

    float c_th = cos( theta_deform ), s_th = sin( theta_deform );
    float sh_v = sinh( v ), ch_v = cosh( v );
    float s_u = sin( u ), c_u = cos( u );

    float scale = ( sheetScaleP > 0.01 ? sheetScaleP : 1.2 ) * ( 0.85 + 0.35 * audioSwell );

    vec3 world_pos = vec3(
                         c_th * sh_v * s_u + s_th * ch_v * c_u,
                         -c_th * sh_v * c_u + s_th * ch_v * s_u,
                         u * c_th + v * s_th )
                     * ( scale * 0.9 );

    // Exact normal to Bonnet associated family of minimal surfaces
    vNormal = normalize( vec3( -s_u / ch_v, c_u / ch_v, -sh_v / ch_v ) );

    vCol = imgPalette( fract( theta_deform * 0.159 + length( uv ) * 0.25 + audioCentroid ) );

    // Camera Transform (V3)
    vec3 vp = world_pos;
    vp.z += 4.5;
    vp.x -= eyeOff;

    // 3D rotation
    float tilt = 0.55;
    float c = cos( tilt ), s = sin( tilt );
    vp = vec3( vp.x, vp.y * c - vp.z * s, vp.y * s + vp.z * c );

    gl_Position = projM * vec4( vp.x, vp.y, -vp.z, 1.0 );
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
