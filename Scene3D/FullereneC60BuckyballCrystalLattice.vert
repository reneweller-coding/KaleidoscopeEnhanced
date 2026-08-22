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

    // Each cube is ONE CARBON ATOM: 60 atoms per C60 cage (spherical
    // Fibonacci points -- a close visual stand-in for the truncated
    // icosahedron), cages on a face-centred 4x4x5 crystal.  The old build
    // spread lone 0.08-unit cubes over a 12x12x34 grid: recorded as a
    // sparse dust of white boxes with no molecule in sight.
    float ballIdx = floor(cIndex / 60.0);          // 0..81
    float atomIdx = mod(cIndex, 60.0);

    float bx = mod(ballIdx, 4.0);
    float by = mod(floor(ballIdx / 4.0), 4.0);
    float bz = floor(ballIdx / 16.0);              // 0..5
    vec3 centerPos = (vec3(bx, by, bz) - vec3(1.5, 1.5, 2.5)) * (2.05 * pitch)
                   + vec3(0.5 * pitch * mod(bz, 2.0));   // fcc-like stagger

    float r = length(centerPos);

    // Spherical Fibonacci direction for this atom.
    float ga = 2.39996323;
    float zf = 1.0 - 2.0 * (atomIdx + 0.5) / 60.0;
    float rf = sqrt(max(0.0, 1.0 - zf * zf));
    float th = atomIdx * ga;
    vec3 atomDir = vec3(rf * cos(th), rf * sin(th), zf);

    float cageR = (buckySizeP > 0.01 ? (0.45 + 2.0 * buckySizeP) : 0.62)
                * (1.0 + 0.06 * audioSwell);

    // C60 cage vibration pulse (breathing mode), travelling through the
    // crystal as a wave.
    float pulse = exp(-abs(fract(r * 0.8 - t * 2.0) - 0.5) * 16.0) * (1.0 + 3.0 * audioKick);
    vBuckyPulse = pulse;

    float bSize = 0.065 * (1.0 + 0.25 * pulse);
    vec3 worldPos = centerPos + atomDir * cageR * (1.0 + 0.05 * pulse)
                  + corner * bSize;
    vNormal = normalize(corner);

    vCol = imgPalette(fract(0.10 + ballIdx * 0.037 + atomDir.z * 0.08));

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
