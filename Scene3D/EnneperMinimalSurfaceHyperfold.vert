#version 330 core
/**
 * @file EnneperMinimalSurfaceHyperfold.vert
 * @brief Vertex stage companion to EnneperMinimalSurfaceHyperfold.frag -- see that file's
 * header for this scene's description.
 */

in vec4 attrA; // xy = Cell UV [0,1], z = 0, w = Cell index
in vec4 attrB; // 4 seeds in [0,1)

out vec2 vUV;
out vec3 vNormal;
out vec3 vCol;
out float vCurvature;

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

uniform float enneperScaleP;
uniform float hyperfoldP;

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
    // Remap grid UV [0,1] to centered [-1,1] domain
    vec2 uv = attrA.xy * 2.0 - 1.0;
    vUV = attrA.xy;
    
    float t = time * 0.35 + audioAdvance * 0.3;
    
    // Scale domain for Enneper surface parameters (u, v)
    float domainScale = 1.35 * (enneperScaleP > 0.01 ? enneperScaleP : 1.0);
    float u = uv.x * domainScale;
    float v = uv.y * domainScale;
    
    // Rotate (u, v) domain with audioPhase
    float cu = cos(audioPhase * 0.3), su = sin(audioPhase * 0.3);
    vec2 rotUV = vec2(u * cu - v * su, u * su + v * cu);
    u = rotUV.x;
    v = rotUV.y;
    
    // Higher-order Enneper Minimal Surface equations
    float fold = (hyperfoldP > 0.01 ? hyperfoldP : 1.0);
    float x = u - (u * u * u) / 3.0 + u * v * v * fold;
    float y = v - (v * v * v) / 3.0 + v * u * u * fold;
    float z = (u * u - v * v) * (0.8 + 0.3 * audioSwell);
    
    vec3 worldPos = vec3(x, y, z) * 0.8;
    
    // Analytical Normal for Enneper surface: n = (-2u, 2v, u^2 + v^2 - 1) / (1 + u^2 + v^2)
    vec3 n = normalize(vec3(-2.0 * u, 2.0 * v, u * u + v * v - 1.0));
    vNormal = n;
    
    // Gaussian Curvature K = -4 / (1 + u^2 + v^2)^4
    float K = 4.0 / pow(1.0 + u * u + v * v, 4.0);
    vCurvature = K;
    
    vCol = imgPalette(fract(K * 0.8 + length(uv) * 0.3 + audioCentroid));
    
    // Camera Transform (V3)
    vec3 vp = worldPos;
    
    // Smooth rotation in 3D
    float c = cos(t * 0.2), s = sin(t * 0.2);
    vp = vec3(vp.x * c - vp.z * s, vp.y, vp.x * s + vp.z * c);
    vp.z += 4.5;
    vp.x -= eyeOff;
    
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
