#version 330 core
/**
 * @file HelicoidMinimalSurfaceTunnel.vert
 * @brief Vertex stage companion to HelicoidMinimalSurfaceTunnel.frag -- see that file's
 * header for this scene's description.
 */

in vec4 attrA; ///< xy = Cell UV [0,1], z = 0, w = Cell index
in vec4 attrB; ///< 4 seeds in [0,1)

out vec2 vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
out vec3 vNormal;   ///< Surface normal (from the vertex stage).
out vec3 vCol;   ///< Colour (from the vertex stage).
out float vHelicoidAngle;

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

uniform float helicoidPitchP;
uniform float tunnelRadiusP;

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
    
    // Helicoid minimal surface parametrization: x = rho * cos(phi), y = rho * sin(phi), z = c * phi
    float rho = uv.x * (tunnelRadiusP > 0.01 ? tunnelRadiusP : 1.8);
    float pitch = (helicoidPitchP > 0.01 ? helicoidPitchP : 0.6);
    
    // Time spins the helicoid (phase of phi) but must NOT enter the z
    // extent: with z ~ phi the whole tunnel drifted away down +z without
    // bound and left the frustum after a few bars.
    float wind = uv.y * 6.2831853;
    float phi = wind + t * 1.5;
    vHelicoidAngle = phi;

    float zPos = wind * pitch * 0.4;
    
    vec3 worldPos = vec3(
        rho * cos(phi),
        rho * sin(phi),
        zPos - 1.2
    );
    
    // Normal to Helicoid: n = (-sin(phi), cos(phi), -rho/c) / sqrt(1 + rho^2/c^2)
    float c_val = pitch * 0.4;
    float denom = sqrt(1.0 + (rho * rho) / (c_val * c_val));
    vNormal = normalize(vec3(-sin(phi), cos(phi), -rho / c_val));
    
    vCol = imgPalette(fract(phi * 0.159 + rho * 0.2 + audioCentroid));
    
    // Camera Transform (V3)
    vec3 vp = worldPos;
    
    // 3D rotation
    float c = cos(t * 0.15), s = sin(t * 0.15);
    vp = vec3(vp.x * c - vp.z * s, vp.y, vp.x * s + vp.z * c);
    vp.z += 4.5;
    vp.x -= eyeOff;
    
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
