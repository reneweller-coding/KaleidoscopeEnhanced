#version 330 core
/**
 * @file PolaritonCondensateVortexLattice.vert
 * @brief Vertex stage companion to PolaritonCondensateVortexLattice.frag -- see that file's
 * header for this scene's description.
 */

in vec4 attrA; // xy = Cell UV [0,1], z = 0, w = Cell index
in vec4 attrB; // 4 seeds in [0,1)

out vec2 vUV;
out vec3 vNormal;
out vec3 vCol;
out float vPhase;

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

uniform float vortexDensityP;
uniform float waveHeightP;

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
    
    float t = time * 0.4 + audioAdvance * 0.35;
    
    // Scale spatial coordinates
    vec2 p = uv * 3.5;
    
    // Triangular Abrikosov-like vortex lattice in macroscopic polariton wavefield
    float vScale = (vortexDensityP > 0.01 ? vortexDensityP : 2.5);
    vec2 q = p * vScale;
    
    float phaseAcc = 0.0;
    float heightAcc = 0.0;
    
    for (float i = 1.0; i <= 4.0; i += 1.0) {
        vec2 vPos = vec2(cos(i * 1.57 + t * 0.3), sin(i * 1.57 + t * 0.3)) * (0.8 + 0.3 * sin(t * 0.5 + i));
        vec2 diff = p - vPos;
        float angle = atan(diff.y, diff.x);
        float dist = length(diff);
        
        // Quantized 2pi vortex winding
        phaseAcc += angle;
        // Vortex core dip
        heightAcc += (1.0 - exp(-dist * dist * 3.0));
    }
    
    // Superfluid acoustic phonon waves
    float phonons = sin(length(p) * 6.0 - t * 3.0) * 0.15;
    
    float hScale = (waveHeightP > 0.01 ? waveHeightP : 0.45) * (1.0 + 0.5 * audioSwell);
    float zHeight = (heightAcc * 0.25 - 0.5 + phonons) * hScale;
    
    // Approximate surface normal
    float dHdx = cos(p.x * 6.0 - t * 3.0) * 0.2;
    float dHdy = cos(p.y * 6.0 - t * 3.0) * 0.2;
    vNormal = normalize(vec3(-dHdx, -dHdy, 1.0));
    
    vPhase = phaseAcc;
    vCol = imgPalette(fract(phaseAcc * 0.159 + t * 0.05 + audioCentroid));
    
    vec3 worldPos = vec3(p.x, p.y, zHeight);
    
    // Camera Transform (V3)
    vec3 vp = worldPos;
    vp.z += 4.8;
    vp.x -= eyeOff;
    
    // Surface tilt
    float tilt = 0.65;
    float c = cos(tilt), s = sin(tilt);
    vp = vec3(vp.x, vp.y * c - vp.z * s, vp.y * s + vp.z * c);
    
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
