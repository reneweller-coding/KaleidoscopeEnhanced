#version 330 core
/**
 * @file BacteriophageIcosahedralCapsidInjection.vert
 * @brief Vertex stage companion to BacteriophageIcosahedralCapsidInjection.frag -- see that file's
 * header for this scene's description.
 */

in vec4 attrA; // xy = Patch UV [0,1], z = 0, w = Patch index
in vec4 attrB; // 4 seeds in [0,1)

out vec2 vUV;
out vec3 vNormal;
out vec3 vCol;
out float vInjectGlow;

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

uniform float phageScaleP;
uniform float tailContractP;

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
    
    // T4 Bacteriophage macromolecular complex: Icosahedral head + contractile tail + tail fibers
    float u = uv.x * 3.14159265;
    float v = uv.y * 3.14159265;
    
    float scale = (phageScaleP > 0.01 ? phageScaleP : 1.2) * (0.85 + 0.35 * audioSwell);
    
    // Capsid head (top: y > 0) + contractile sheath tail (bottom: y < 0)
    float isHead = smoothstep(-0.2, 0.2, uv.y);
    
    // Icosahedral faceted head radius
    float headR = (0.7 + 0.15 * cos(u * 5.0) * sin(v * 5.0)) * isHead;
    
    // Contractile tail sheath radius
    float contract = (tailContractP > 0.01 ? tailContractP : 1.0) * (1.0 + 0.3 * audioKick);
    float tailR = (0.2 + 0.04 * sin(uv.y * 24.0 * contract)) * (1.0 - isHead);
    
    float r = headR + tailR;
    float zH = uv.y * 1.8;
    
    vec3 worldPos = vec3(
        r * cos(u),
        r * sin(u),
        zH
    ) * scale;
    
    // DNA genome injection flash at baseplate (bottom tip)
    float atBase = smoothstep(-0.6, -0.95, uv.y);
    float injectGlow = atBase * (1.0 + 3.5 * audioKick);
    vInjectGlow = injectGlow;
    
    vNormal = normalize(vec3(cos(u), sin(u), isHead * 0.5));
    
    vCol = imgPalette(fract(uv.y * 0.3 + u * 0.159 + audioCentroid));
    
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
