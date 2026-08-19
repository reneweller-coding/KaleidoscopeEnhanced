#version 330 core
/**
 * @file CalabiYauSixDimensionalManifoldCrossSection.vert
 * @brief Vertex stage companion to CalabiYauSixDimensionalManifoldCrossSection.frag -- see that file's
 * header for this scene's description.
 */

in vec4 attrA; // xy = Cell UV [0,1], z = 0, w = Cell index
in vec4 attrB; // 4 seeds in [0,1)

out vec2 vUV;
out vec3 vNormal;
out vec3 vCol;
out float vCalabiPhase;

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

uniform float calabiScaleP;
uniform float foldDegreeP;

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
    
    // Calabi-Yau 6D compactification manifold 2D cross-section projection
    // Complex curve: z1^n + z2^n = 1 projected to R^3
    float u = uv.x * 3.14159265;
    float v = uv.y * 3.14159265;
    
    float n = (foldDegreeP > 0.01 ? foldDegreeP : 5.0); // Quintic 3-fold
    float phase = u * n + t * 0.8 + audioPhase * 0.3;
    vCalabiPhase = phase;
    
    float r1 = cos(u);
    float r2 = sin(u);
    
    float cScale = (calabiScaleP > 0.01 ? calabiScaleP : 1.3) * (0.85 + 0.35 * audioSwell);
    
    // Toric and spheroidal complex folds
    vec3 worldPos = vec3(
        r1 * cos(v) + 0.3 * cos(phase) * sin(v),
        r1 * sin(v) - 0.3 * cos(phase) * cos(v),
        r2 * cos(phase * 0.5) + 0.25 * sin(v * 3.0)
    ) * (cScale * 1.5);
    
    // Normal estimation
    vNormal = normalize(vec3(cos(u) * cos(v), cos(u) * sin(v), sin(u)));
    
    vCol = imgPalette(fract(phase * 0.159 + v * 0.2 + audioCentroid));
    
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
