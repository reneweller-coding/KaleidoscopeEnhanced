#version 330 core
/**
 * @file DeepSeaHydrothermalChimneyPillar.vert
 * @brief Vertex stage companion to DeepSeaHydrothermalChimneyPillar.frag -- see that file's
 * header for this scene's description.
 */

in vec4 attrA; // xy = Patch UV [0,1], z = 0, w = Patch index
in vec4 attrB; // 4 seeds in [0,1)

out vec2 vUV;
out vec3 vNormal;
out vec3 vCol;
out float vSmokerGlow;

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

uniform float pillarScaleP;
uniform float ventGlowP;

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
    
    // Deep-sea black smoker hydrothermal chimney pillar (cylindrical mineral tower with central orifice)
    float u = uv.x * 3.14159265;
    float v = uv.y * 3.14159265;
    
    float scale = (pillarScaleP > 0.01 ? pillarScaleP : 1.2) * (0.85 + 0.35 * audioSwell);
    
    float towerH = (1.0 - uv.y) * 1.8;
    float towerR = (0.35 + 0.15 * cos(u * 5.0) * sin(v * 4.0));
    
    // Tower axis on Y (vertical in frame) -- built on z it pointed into
    // the view depth and the fixed tilt below parked it under the frame.
    vec3 worldPos = vec3(
        towerR * cos(u),
        towerH - 0.9,
        towerR * sin(u)
    ) * scale;
    
    // Superheated hydrothermal black smoker fluid eruption at top of
    // chimney.  towerH = (1 - uv.y)*1.8, so the SUMMIT is at uv.y = -1 --
    // the apex test must look at -uv.y or the glow sits on the sea floor.
    float atApex = smoothstep(0.65, 0.95, -uv.y);
    float smokerGlow = atApex * (1.0 + 3.5 * audioKick) * (ventGlowP > 0.01 ? ventGlowP : 1.3);
    vSmokerGlow = smokerGlow;
    
    vNormal = normalize(vec3(cos(u), 0.3, sin(u)));
    
    vCol = imgPalette(fract(uv.y * 0.3 + u * 0.159 + audioCentroid));
    
    // Camera Transform (V3): tilt BEFORE the translate so it leans the
    // tower itself -- applied after, it swings the whole scene centre
    // down by sin(tilt)*4.5 and out of the frame.
    vec3 vp = worldPos;
    float tilt = 0.55;
    float c = cos(tilt), s = sin(tilt);
    vp = vec3(vp.x, vp.y * c - vp.z * s, vp.y * s + vp.z * c);
    vp.z += 4.5;
    vp.x -= eyeOff;
    
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
