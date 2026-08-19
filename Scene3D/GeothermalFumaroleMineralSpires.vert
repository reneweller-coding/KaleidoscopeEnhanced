#version 330 core
/**
 * @file GeothermalFumaroleMineralSpires.vert
 * @brief Vertex stage companion to GeothermalFumaroleMineralSpires.frag -- see that file's
 * header for this scene's description.
 */

in vec4 attrA; // xy = Patch UV [0,1], z = 0, w = Patch index
in vec4 attrB; // 4 seeds in [0,1)

out vec2 vUV;
out vec3 vNormal;
out vec3 vCol;
out float vVentGlow;

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

uniform float spireScaleP;
uniform float gasP;

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

vec3 palTint(vec3 c, float t, float k)
{
    vec3 tp = imgPalette(t);
    tp *= dot(c, vec3(0.3333)) / max(dot(tp, vec3(0.3333)), 1e-3);
    return mix(c, tp, k);
}

void main()
{
    // Remap patch UV [0,1] to centered [-1,1] domain
    vec2 uv = attrA.xy * 2.0 - 1.0;
    vUV = attrA.xy;
    
    float t = time * 0.35 + audioAdvance * 0.3;
    
    // Hydrothermal / volcanic mineral chimney spires (conical towers with central vent)
    float u = uv.x * 3.14159265;
    float v = uv.y * 3.14159265;
    
    float spireH = (1.0 - uv.y) * 1.8;
    float spireR = (0.3 + 0.25 * (uv.y + 1.0)) * (spireScaleP > 0.01 ? spireScaleP : 1.0);
    
    // Porous mineral crust rufflings
    float mineralRuff = sin(u * 8.0) * cos(v * 6.0) * 0.08;
    spireR += mineralRuff;
    
    // Spire axis on Y (vertical in frame) -- on z it pointed into the
    // view depth and only the base peeked into the bottom of the frame.
    vec3 worldPos = vec3(
        spireR * cos(u),
        spireH - 0.9,
        spireR * sin(u)
    );

    // Superheated hydrothermal vent glow at chimney apex.  spireH =
    // (1 - uv.y)*1.8 puts the SUMMIT at uv.y = -1, so the apex test must
    // look at -uv.y (with +uv.y it glowed at the base).
    float atApex = smoothstep(0.6, 0.95, -uv.y);
    float ventGlow = atApex * (1.0 + 3.0 * audioKick) * (gasP > 0.01 ? gasP : 1.2);
    vVentGlow = ventGlow;

    vNormal = normalize(vec3(cos(u), 0.4, sin(u)));
    
    // Sulfide mineral / sulfur yellow / chalcopyrite palette
    vec3 sulfurYellow = vec3(0.9, 0.75, 0.15);
    vCol = palTint(sulfurYellow, attrA.y * 0.3 + audioCentroid, 0.25);
    
    // Camera Transform (V3): tilt BEFORE the translate -- applied after,
    // it swings the scene centre down by sin(tilt)*4.5 and out of frame.
    vec3 vp = worldPos;
    float tilt = 0.55;
    float c = cos(tilt), s = sin(tilt);
    vp = vec3(vp.x, vp.y * c - vp.z * s, vp.y * s + vp.z * c);
    vp.z += 4.5;
    vp.x -= eyeOff;
    
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
