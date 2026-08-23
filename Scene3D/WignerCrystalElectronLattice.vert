#version 330 core
/**
 * @file WignerCrystalElectronLattice.vert
 * @brief Vertex stage companion to WignerCrystalElectronLattice.frag -- see that file's
 * header for this scene's description.
 */

in vec4 attrA; // w = point index
in vec4 attrB; // 4 seeds in [0,1)

out vec3 vCol;
out float vPhononAmp;

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

uniform float crystalScaleP;
uniform float jitterP;

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
    float t = time * 0.4 + audioAdvance * 0.35;

    // Triangular 2D/3D electron lattice arrangement
    float pIdx = attrA.w;
    vec3 seed = attrB.xyz;

    // Triangular grid indices
    float row = floor(sqrt(pIdx));
    float colIdx = pIdx - row * row;

    float scale = (crystalScaleP > 0.01 ? crystalScaleP : 0.12);
    float x = (colIdx - row * 0.5) * scale * 1.7320508;
    float y = (row - 100.0) * scale * 1.5;

    // Phonon acoustic wave displacement
    float phononFreq = 4.0;
    float phononWave = sin(length(vec2(x, y)) * phononFreq - t * 3.0 + audioPhase);
    vPhononAmp = phononWave * 0.5 + 0.5;

    // Quantum zero-point jitter
    float jitStr = (jitterP > 0.001 ? jitterP : 0.02) * (1.0 + 2.0 * audioKick);
    vec3 jitter = (seed - 0.5) * jitStr;

    float z = phononWave * 0.25 * (1.0 + 0.5 * audioSwell);
    vec3 worldPos = vec3(x * 0.15, y * 0.15, z) + jitter;

    vCol = imgPalette(fract(vPhononAmp * 0.4 + seed.x * 0.2 + audioCentroid));

    // Controlled Point Size (Rule V8c: Cap 10-16 px for 60k points)
    gl_PointSize = clamp(18.6 + audioKick * 1.0, 4.0, 27.0);   // sprite sweep 2026-08-22: measured luma 0.049, area x2.9

    // Camera Transform (V3). Tilt FIRST, about the lattice centre -- the
    // old tilt-after-dolly shifted the structure down by 4.8*sin(0.55)
    // (~2.5 units), cropping it to the bottom corner of the frame.
    vec3 vp = worldPos;
    float tilt = 0.55;
    float c = cos(tilt), s = sin(tilt);
    vp = vec3(vp.x, vp.y * c - vp.z * s, vp.y * s + vp.z * c);
    vp.z += 5.4;
    vp.x -= eyeOff;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
