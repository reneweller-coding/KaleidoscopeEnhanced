#version 330 core
/**
 * @file BioluminescentCombJellyCydippid.vert
 * @brief Vertex stage companion to BioluminescentCombJellyCydippid.frag -- see that file's
 * header for this scene's description.
 */

in vec4 attrA; // x = t [0,1], y = side (-1/+1), z = 0, w = ribbon index
in vec4 attrB; // 4 seeds in [0,1)

out vec2 vUV;
out float vSide;
out float vRibbonID;
out vec3 vCol;
out float vCiliaWave;

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

uniform float bodyScaleP;
uniform float ribbonWidthP;
uniform float beatSpeedP;

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
    float tCoord = attrA.x;
    float side   = attrA.y;
    float rIndex = attrA.w;
    
    vSide = side;
    vRibbonID = rIndex;
    vUV = vec2(tCoord, side * 0.5 + 0.5);
    
    float t = time * 0.35 + audioAdvance * 0.3;
    
    // 8 comb rows (ctenes) meridionally arranged around translucent oval body
    float cteneAngle = rIndex * 0.31415927; // 20 ctene rows (engine builds 20 ribbons)
    float bScale = (bodyScaleP > 0.01 ? bodyScaleP : 1.2);
    
    // Meridional ellipse profile from oral to aboral pole
    float theta = (tCoord - 0.5) * 3.14159265;
    float rBody = cos(theta) * 0.95 * bScale;
    float zBody = sin(theta) * 1.6 * bScale;
    
    // Hydrodynamic swimming pulsation
    float pulse = sin(t * 1.5) * 0.08;
    rBody += pulse;
    
    vec3 centerPos = vec3(
        cos(cteneAngle) * rBody,
        sin(cteneAngle) * rBody,
        zBody
    );
    
    vec3 tangent = normalize(vec3(-cos(cteneAngle) * sin(theta), -sin(cteneAngle) * sin(theta), cos(theta)));
    vec3 binormal = normalize(cross(tangent, vec3(cos(cteneAngle), sin(cteneAngle), 0.0)));
    
    float width = (ribbonWidthP > 0.001 ? ribbonWidthP : 0.055) * (1.0 + 0.3 * audioSwell);
    vec3 worldPos = centerPos + binormal * (side * width);
    
    // Metachronal ciliary comb plate beating waves
    float vBeat = (beatSpeedP > 0.01 ? beatSpeedP : 2.5);
    float cilia = sin(tCoord * 28.0 - t * vBeat + rIndex * 0.4);
    float ciliaGlow = pow(cilia * 0.5 + 0.5, 3.0) * (1.0 + 3.0 * audioKick);
    vCiliaWave = ciliaGlow;
    
    // Translucent comb plate diffraction iridescence
    vec3 iridCol = vec3(0.2, 0.85, 0.95);
    vCol = palTint(iridCol, fract(tCoord * 0.4 + rIndex * 0.125 + audioCentroid), 0.28);
    
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
