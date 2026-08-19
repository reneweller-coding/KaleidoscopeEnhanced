#version 330 core
/**
 * @file HyperbolicPseudosphereTractroid.vert
 * @brief Vertex stage companion to HyperbolicPseudosphereTractroid.frag -- see that file's
 * header for this scene's description.
 */

in vec4 attrA; // xy = Patch UV [0,1], z = 0, w = Patch index
in vec4 attrB; // 4 seeds in [0,1)

out vec2 vUV;
out vec3 vNormal;
out vec3 vCol;
out float vTractrixU;

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

uniform float pseudoScaleP;
uniform float tractrixCuspP;

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
    // Remap patch UV [0,1] to centered [-1,1] domain
    vec2 uv = attrA.xy * 2.0 - 1.0;
    vUV = attrA.xy;
    
    float t = time * 0.35 + audioAdvance * 0.3;
    
    // Pseudosphere / Tractricoid surface of constant negative Gaussian curvature K = -1
    // Parametrization: x = sech(u) * cos(v), y = sech(u) * sin(v), z = u - tanh(u)
    float u = uv.y * 2.2;
    float v = uv.x * 3.14159265;
    vTractrixU = u;
    
    float sechU = 1.0 / cosh(u);
    float tanhU = tanh(u);
    
    float scale = (pseudoScaleP > 0.01 ? pseudoScaleP : 1.3) * (0.85 + 0.35 * audioSwell);
    
    // Asymmetric flared trumpet bells
    float cuspWarp = 1.0 + 0.12 * sin(v * 4.0 + t * 0.8) * (tractrixCuspP > 0.01 ? tractrixCuspP : 1.0);
    
    vec3 worldPos = vec3(
        sechU * cos(v) * cuspWarp,
        sechU * sin(v) * cuspWarp,
        u - tanhU
    ) * scale;
    
    // Normal to Tractricoid
    vNormal = normalize(vec3(-tanhU * cos(v), -tanhU * sin(v), sechU));
    
    vCol = imgPalette(fract(u * 0.2 + v * 0.159 + audioCentroid));
    
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
