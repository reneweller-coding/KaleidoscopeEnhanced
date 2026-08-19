#version 330 core
/**
 * @file CosmicInflationaryTensorModes.vert
 * @brief Vertex stage companion to CosmicInflationaryTensorModes.frag -- see that file's
 * header for this scene's description.
 */

in vec4 attrA; // xy = Cell UV [0,1], z = 0, w = Cell index
in vec4 attrB; // 4 seeds in [0,1)

out vec2 vUV;
out vec3 vNormal;
out vec3 vCol;
out float vGravWavePhase;

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

uniform float tensorScaleP;
uniform float gwFreqP;

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
    
    // Primordial tensor metric perturbations: h_+ and h_x polarizations
    float kGW = (gwFreqP > 0.01 ? gwFreqP : 8.0);
    float wavePhase = (uv.x + uv.y) * kGW - t * 3.0;
    vGravWavePhase = wavePhase;
    
    // + polarization (stretching x while compressing y) & x polarization (45-degree shear)
    float hPlus  = cos(wavePhase) * (uv.x * uv.x - uv.y * uv.y) * 0.15;
    float hCross = sin(wavePhase + audioPhase * 0.5) * (2.0 * uv.x * uv.y) * 0.15;
    
    float tScale = (tensorScaleP > 0.01 ? tensorScaleP : 1.2) * (0.85 + 0.35 * audioSwell);
    float zWarp = (hPlus + hCross) * tScale;
    
    // Space metric expansion background
    vec3 worldPos = vec3(uv.x * 3.0, uv.y * 3.0, zWarp);
    
    // Metric curvature normal
    float dHdx = cos(wavePhase) * uv.x * 0.4;
    float dHdy = sin(wavePhase) * uv.y * 0.4;
    vNormal = normalize(vec3(-dHdx, -dHdy, 1.0));
    
    vCol = imgPalette(fract(wavePhase * 0.159 + length(uv) * 0.25 + audioCentroid));
    
    // Camera Transform (V3)
    vec3 vp = worldPos;
    vp.z += 4.5;
    vp.x -= eyeOff;
    
    // 3D perspective tilt
    float tilt = 0.55;
    float c = cos(tilt), s = sin(tilt);
    vp = vec3(vp.x, vp.y * c - vp.z * s, vp.y * s + vp.z * c);
    
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
