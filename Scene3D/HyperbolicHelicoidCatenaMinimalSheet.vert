#version 330 core
/**
 * @file HyperbolicHelicoidCatenaMinimalSheet.vert
 * @brief Vertex stage companion to HyperbolicHelicoidCatenaMinimalSheet.frag -- see that file's
 * header for this scene's description.
 */

in vec4 attrA; ///< xy = Cell UV [0,1], z = 0, w = Cell index
in vec4 attrB; ///< 4 seeds in [0,1)

out vec2 vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
out vec3 vNormal;   ///< Surface normal (from the vertex stage).
out vec3 vCol;   ///< Colour (from the vertex stage).
out float vDeformAngle;

uniform mat4 projM;   ///< Projection matrix.
uniform float eyeOff;   ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).

uniform float audioPhase;   ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioCentroid;   ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float sheetScaleP;
uniform float deformSpeedP;

/// @brief The photo at a coordinate: the cross-fade of tex0 and tex1.
vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

/// @brief The house palette: a colour of the photo on an arc that turns with the music's hue.
vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  col = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float g   = dot(col, vec3(0.333));
    return mix(vec3(g), col, 0.55 + 0.45 * audioValence);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
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
    
    float vSpeed = (deformSpeedP > 0.01 ? deformSpeedP : 1.0);
    float thetaDeform = t * 0.8 * vSpeed + audioPhase * 0.5;
    vDeformAngle = thetaDeform;
    
    float cTh = cos(thetaDeform), sTh = sin(thetaDeform);
    float shV = sinh(v), chV = cosh(v);
    float sU = sin(u), cU = cos(u);
    
    float scale = (sheetScaleP > 0.01 ? sheetScaleP : 1.2) * (0.85 + 0.35 * audioSwell);
    
    vec3 worldPos = vec3(
        cTh * shV * sU + sTh * chV * cU,
        -cTh * shV * cU + sTh * chV * sU,
        u * cTh + v * sTh
    ) * (scale * 0.9);
    
    // Exact normal to Bonnet associated family of minimal surfaces
    vNormal = normalize(vec3(-sU / chV, cU / chV, -shV / chV));
    
    vCol = imgPalette(fract(thetaDeform * 0.159 + length(uv) * 0.25 + audioCentroid));
    
    // Camera Transform (V3)
    vec3 vp = worldPos;
    vp.z += 4.5;
    vp.x -= eyeOff;
    
    // 3D rotation
    float tilt = 0.55;
    float c = cos(tilt), s = sin(tilt);
    vp = vec3(vp.x, vp.y * c - vp.z * s, vp.y * s + vp.z * c);
    
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
