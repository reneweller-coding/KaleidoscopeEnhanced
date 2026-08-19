#version 330 core
/**
 * @file AtmosphericGravityWaveUndularBore.vert
 * @brief Vertex stage companion to AtmosphericGravityWaveUndularBore.frag -- see that file's
 * header for this scene's description.
 */

in vec4 attrA; // xy = Cell UV [0,1], z = 0, w = Cell index
in vec4 attrB; // 4 seeds in [0,1)

out vec2 vUV;
out vec3 vNormal;
out vec3 vCol;
out float vAirglow;

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

uniform float boreWaveP;
uniform float airglowP;

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
    
    float t = time * 0.35 + audioAdvance * 0.3;
    
    // Mesospheric undular bore gravity wave train
    float boreFreq = (boreWaveP > 0.01 ? boreWaveP : 10.0);
    float wavePhase = uv.y * boreFreq - t * 2.5;
    
    // Non-linear cnoidal wave soliton train
    float waveCrest = pow(sin(wavePhase) * 0.5 + 0.5, 3.0);
    float waveHeight = waveCrest * 0.35 * (1.0 + 0.4 * audioSwell);
    
    // Atmospheric curvature (spherical shell)
    float r2 = dot(uv, uv);
    float earthCurv = -r2 * 0.45;
    
    vec3 worldPos = vec3(uv.x * 3.2, uv.y * 3.2, earthCurv + waveHeight);
    
    // Surface normal
    float dHdy = cos(wavePhase) * 0.4;
    vNormal = normalize(vec3(0.0, -dHdy, 1.0));
    
    // Mesospheric hydroxyl chemiluminescence (airglow emerald green)
    float airglow = waveCrest * (1.0 + 2.0 * audioKick);
    vAirglow = airglow;
    
    vec3 airglowGreen = vec3(0.15, 0.95, 0.45);
    vCol = palTint(airglowGreen, attrA.y * 0.4 + audioCentroid, 0.26);
    
    // Camera Transform (V3)
    vec3 vp = worldPos;
    vp.z += 4.5;
    vp.x -= eyeOff;
    
    // Isometric tilt looking across atmosphere
    float tilt = 0.55;
    float c = cos(tilt), s = sin(tilt);
    vp = vec3(vp.x, vp.y * c - vp.z * s, vp.y * s + vp.z * c);
    
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
