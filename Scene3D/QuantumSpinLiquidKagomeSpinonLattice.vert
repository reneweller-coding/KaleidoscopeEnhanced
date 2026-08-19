#version 330 core
/**
 * @file QuantumSpinLiquidKagomeSpinonLattice.vert
 * @brief Vertex stage companion to QuantumSpinLiquidKagomeSpinonLattice.frag -- see that file's
 * header for this scene's description.
 */

in vec4 attrA; // xyz = position seed, w = pointID
in vec4 attrB; // 4 seeds in [0,1)

out vec3 vCol;
out float vSpinon;
out float vPointSize;

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

uniform float kagomePitchP;
uniform float pointSizeP;
uniform float spinonSpreadP;

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
    float pId = attrA.w;
    vec4 seeds = attrB;
    
    float t = time * 0.35 + audioAdvance * 0.3;
    
    // Quantum spin liquid Kagome-pyrochlore lattice (stacked corner-sharing triangles)
    float pitch = (kagomePitchP > 0.01 ? kagomePitchP : 0.026);
    
    float nSide = 39.0; // ~ 60,000 points
    float ix = mod(pId, nSide);
    float iy = mod(floor(pId / nSide), nSide);
    float iz = floor(pId / (nSide * nSide));
    
    // Kagome triangle corner offsets
    float triangleSub = mod(ix + iy + iz, 3.0);
    vec3 subOffset = vec3(
        triangleSub == 0.0 ? 0.0 : (triangleSub == 1.0 ? 0.5 : 0.25),
        triangleSub == 0.0 ? 0.0 : (triangleSub == 1.0 ? 0.0 : 0.433),
        0.0
    );
    
    vec3 gridPos = (vec3(ix, iy * 0.866, iz * 0.816) + subOffset - vec3(nSide * 0.5)) * pitch * 2.2;
    
    // Fractionalized spinon excitation waves wandering through spin liquid
    float r = length(gridPos);
    float kSpread = (spinonSpreadP > 0.01 ? spinonSpreadP : 1.2);
    float spinonWave = sin(r * 8.0 * kSpread - t * 4.5 + seeds.x * 3.0 + audioPhase);
    float isSpinon = smoothstep(0.2, 0.85, spinonWave);
    vSpinon = isSpinon;
    
    vec3 jitter = (seeds.xyz - 0.5) * 0.02 * (1.0 + 0.5 * isSpinon);
    vec3 worldPos = gridPos + jitter;
    
    // Point size capped to 10-18px (V8c)
    float psMax = (pointSizeP > 0.01 ? pointSizeP : 12.0);
    gl_PointSize = clamp(psMax * (0.8 + 0.4 * isSpinon), 8.0, 16.0);
    vPointSize = gl_PointSize;
    
    vCol = imgPalette(fract(r * 0.2 + triangleSub * 0.333 + audioCentroid));
    
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
