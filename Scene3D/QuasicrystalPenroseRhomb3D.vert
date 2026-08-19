#version 330 core
/**
 * @file QuasicrystalPenroseRhomb3D.vert
 * @brief Vertex stage companion to QuasicrystalPenroseRhomb3D.frag -- see that file's
 * header for this scene's description.
 */

in vec4 attrA; // xyz = cube corner (-0.5..0.5), w = cube index
in vec4 attrB; // 4 seeds in [0,1)

out vec3 vNormal;
out vec3 vCol;
out float vQuasiShell;
out vec3 vLocalPos;

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

uniform float quasiScaleP;
uniform float cubeSizeP;

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
    vLocalPos = corner;
    
    float t = time * 0.35 + audioAdvance * 0.3;
    
    // 3D icosahedral quasicrystal: projection of 6D hypercubic lattice onto 3D physical space
    // 6 icosahedral basis vectors along 5-fold axes: (0, +-1, +-tau), etc. (Golden ratio tau = 1.6180339887)
    float tau = 1.6180339887;
    float totalCubes = 256.0;
    float seed = cIndex / totalCubes;
    
    // Golden spiral shell distribution
    float n = cIndex + 1.0;
    float goldenAngle = 2.39996323; // pi * (3 - sqrt(5))
    float r = sqrt(n / totalCubes) * (quasiScaleP > 0.01 ? quasiScaleP : 1.8);
    float theta = n * goldenAngle + t * 0.4;
    float phi = acos(1.0 - 2.0 * n / totalCubes);
    
    // Icosahedral symmetry modulation on radial positions
    float icosMod = 1.0 + 0.18 * (pow(sin(theta * 5.0), 2.0) * pow(sin(phi * 3.0), 2.0));
    r *= icosMod;
    vQuasiShell = r;
    
    vec3 quasiPos = vec3(
        r * sin(phi) * cos(theta),
        r * sin(phi) * sin(theta),
        r * cos(phi)
    );
    
    // Rhombohedral rhombohedron cube scaling
    float sz = (cubeSizeP > 0.001 ? cubeSizeP : 0.065) * (1.0 + 0.3 * audioSwell);
    vec3 cubePos = quasiPos + corner * sz;
    
    vNormal = normalize(corner);
    vCol = imgPalette(fract(seed + r * 0.25 + audioCentroid));
    
    // Camera Transform (V3)
    vec3 vp = cubePos;
    
    // 3D rotation
    float c = cos(t * 0.2), s = sin(t * 0.2);
    vp = vec3(vp.x * c - vp.z * s, vp.y, vp.x * s + vp.z * c);
    vp.z += 4.5;
    vp.x -= eyeOff;
    
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
