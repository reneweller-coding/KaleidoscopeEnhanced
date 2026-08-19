#version 330 core
/**
 * @file KelvinWakeShipWavePattern.vert
 * @brief Vertex stage companion to KelvinWakeShipWavePattern.frag -- see that file's
 * header for this scene's description.
 */

in vec4 attrA; // xy = Cell UV [0,1], z = 0, w = Cell index
in vec4 attrB; // 4 seeds in [0,1)

out vec2 vUV;
out vec3 vNormal;
out vec3 vCol;
out float vCrestGlow;

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

uniform float waveScaleP;
uniform float wakeAngleP;

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
    // Remap grid UV [0,1] to centered [-1,1] domain
    vec2 uv = attrA.xy * 2.0 - 1.0;
    vUV = attrA.xy;
    
    float t = time * 0.4 + audioAdvance * 0.35;
    
    // Ship moving along -y axis with classical Kelvin wake pattern
    // Characteristic Kelvin wedge angle: arcsin(1/3) = 19.47 degrees
    float x = uv.x * 2.8;
    float y = uv.y * 2.8;
    
    // Divergent wave system (echelon waves)
    float thetaKelvin = 0.3398369; // 19.47 degrees in radians
    float wakeCone = abs(x) - max(0.0, -y) * tan(thetaKelvin);
    
    // Transverse and divergent wave phases
    float kTrans = 12.0 * (waveScaleP > 0.01 ? waveScaleP : 1.0);
    float transWave = cos(y * kTrans - t * 4.0) * exp(-abs(x) * 2.0);
    
    float kDiv = 18.0;
    float divWave = cos((abs(x) * 2.0 + y) * kDiv - t * 6.0) * smoothstep(0.1, -0.1, wakeCone);
    
    float totalWaveHeight = (transWave * 0.4 + divWave * 0.6) * 0.22 * (0.85 + 0.35 * audioSwell);
    
    vec3 worldPos = vec3(x, y, totalWaveHeight);
    
    // Wave crest spray / foam illumination
    float crest = pow(clamp(totalWaveHeight * 4.0 + 0.3, 0.0, 1.0), 3.0);
    vCrestGlow = crest * (1.0 + 3.0 * audioKick);
    
    // Approximate surface normal
    float dHdx = -sin((abs(x) * 2.0 + y) * kDiv - t * 6.0) * 0.3;
    float dHdy = -sin(y * kTrans - t * 4.0) * 0.2;
    vNormal = normalize(vec3(-dHdx, -dHdy, 1.0));
    
    // Ocean blue palette
    vec3 oceanBlue = vec3(0.08, 0.45, 0.75);
    vCol = palTint(oceanBlue, attrA.y * 0.3 + audioCentroid, 0.25);
    
    // Camera Transform (V3)
    vec3 vp = worldPos;
    vp.z += 4.5;
    vp.x -= eyeOff;
    
    // Isometric camera tilt looking across ship wake
    float tilt = 0.65;
    float c = cos(tilt), s = sin(tilt);
    vp = vec3(vp.x, vp.y * c - vp.z * s, vp.y * s + vp.z * c);
    
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
