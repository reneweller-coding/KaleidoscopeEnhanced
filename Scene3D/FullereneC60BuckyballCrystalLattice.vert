#version 330 core
/**
 * @file FullereneC60BuckyballCrystalLattice.vert
 * @brief Vertex stage companion to FullereneC60BuckyballCrystalLattice.frag -- see that file's
 * header for this scene's description.
 */

in vec4 attrA; // xyz = cube corner (-0.5..0.5), w = cube index
in vec4 attrB; // 4 seeds in [0,1)

out vec3 vNormal;
out vec3 vCol;
out float vBuckyPulse;

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

uniform float latticePitchP;
uniform float buckySizeP;

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
    vec3 corner = attrA.xyz;
    float cIndex = attrA.w;
    
    float t = time * 0.35 + audioAdvance * 0.3;
    
    // FCC Fullerite C60 crystal lattice: arranged on a 3D grid with truncated icosahedron shells
    float pitch = (latticePitchP > 0.01 ? latticePitchP : 0.85);
    
    float nSide = 12.0;
    float ix = mod(cIndex, nSide);
    float iy = mod(floor(cIndex / nSide), nSide);
    float iz = floor(cIndex / (nSide * nSide));
    
    vec3 centerPos = (vec3(ix, iy, iz) - vec3(nSide * 0.5)) * pitch;
    
    // Truncated icosahedron buckyball shell distortion
    float r = length(centerPos);
    float bSize = (buckySizeP > 0.01 ? buckySizeP : 0.08) * (1.0 + 0.3 * audioSwell);
    
    // C60 cage vibration pulse
    float pulse = exp(-abs(fract(r * 0.8 - t * 2.0) - 0.5) * 16.0) * (1.0 + 3.0 * audioKick);
    vBuckyPulse = pulse;
    
    vec3 worldPos = centerPos + corner * (bSize * (1.0 + 0.4 * pulse));
    vNormal = normalize(corner);
    
    vCol = imgPalette(fract(r * 0.15 + cIndex * 0.005 + audioCentroid));
    
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
