#version 330 core
/**
 * @file InterstellarMHDShockFront.vert
 * @brief Vertex stage companion to InterstellarMHDShockFront.frag -- see that file's
 * header for this scene's description.
 */

in vec4 attrA; // xy = UV [0,1], z = 0, w = cell index
in vec4 attrB; // 4 seeds in [0,1)

out vec2 vUV;
out vec3 vNormal;
out vec3 vCol;
out float vShock;

uniform mat4 projM;
uniform float eyeOff;
uniform float time;

uniform float audioPhase;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioSwell;
uniform float audioCentroid;
uniform float audioValence;
uniform float audioChromaHue;

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float shockCurvP;
uniform float mhdWaveP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  col = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float g   = dot(col, vec3(0.333));
    return mix(vec3(g), col, 0.55 + 0.45 * audioValence);
}

void main()
{
    vec2 uv = attrA.xy * 2.0 - 1.0;
    vUV = attrA.xy;
    
    float t = time * 0.35 + audioAdvance * 0.3;
    
    // Parabolic bow shock surface: z = a * (x^2 + y^2)
    float curv = (shockCurvP > 0.01 ? shockCurvP : 0.45);
    float r2 = dot(uv, uv);
    float zBow = -r2 * curv * 2.5;
    
    // Magnetohydrodynamic Kelvin-Helmholtz ripples
    float mhdFreq = (mhdWaveP > 0.01 ? mhdWaveP : 8.0);
    float ripple = sin(uv.x * mhdFreq + t * 2.5) * cos(uv.y * mhdFreq - t * 2.0) * 0.12;
    ripple *= (1.0 + 0.5 * audioSwell);
    
    vec3 worldPos = vec3(uv.x * 2.8, uv.y * 2.8, zBow + ripple);
    
    // Surface normal
    vec3 n = normalize(vec3(uv.x * curv * 5.0, uv.y * curv * 5.0, 1.0));
    vNormal = n;
    
    // Shock compression intensity
    float shockIntensity = exp(-abs(r2 - 0.45) * 6.0) * (1.0 + 2.0 * audioKick);
    vShock = shockIntensity;
    
    vCol = imgPalette(fract(r2 * 0.3 + uv.x * 0.2 + audioCentroid));
    
    // Camera Transform (V3)
    vec3 vp = worldPos;
    vp.z += 4.5;
    vp.x -= eyeOff;
    
    // Slight tilt
    float tilt = 0.35;
    float c = cos(tilt), s = sin(tilt);
    vp = vec3(vp.x, vp.y * c - vp.z * s, vp.y * s + vp.z * c);
    
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
