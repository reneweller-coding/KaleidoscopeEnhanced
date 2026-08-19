#version 330 core
/**
 * @file MagnetotacticBacteriaChains.vert
 * @brief Vertex stage companion to MagnetotacticBacteriaChains.frag -- see that file's
 * header for this scene's description.
 */

in vec4 attrA; // xyz = cube corner (-0.5..0.5), w = cube index
in vec4 attrB; // 4 seeds in [0,1)

out vec3 vNormal;
out vec3 vCol;
out float vChainID;
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

uniform float chainCountP;
uniform float magnetosomeSizeP;

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
    
    float t = time * 0.4 + audioAdvance * 0.35;
    
    // Divide cubes into chains of magnetosome crystals
    float cubesPerChain = 16.0;
    float chainIdx = floor(cIndex / cubesPerChain);
    float magnetosomeIdx = mod(cIndex, cubesPerChain);
    vChainID = chainIdx;
    
    // Helical swimming path aligning with geomagnetic field lines
    float chainSeed = chainIdx * 0.45;
    float swimT = t * 0.8 + chainSeed;
    
    // Geomagnetic field line: helical trajectory in 3D
    float helixR = 0.6 + 0.3 * sin(chainSeed * 2.0);
    float helixZ = (chainIdx - 8.0) * 0.35 + sin(swimT * 0.5) * 0.2;
    
    float s = (magnetosomeIdx - cubesPerChain * 0.5) * 0.08;
    float phi = swimT * 1.5 + chainSeed + s * 2.0;
    
    vec3 chainCenter = vec3(
        cos(phi) * helixR + cos(chainSeed * 3.0) * 1.2,
        sin(phi) * helixR + sin(chainSeed * 3.0) * 1.2,
        helixZ + s * 1.5
    );
    
    // Magnetite crystal facet size
    float sz = (magnetosomeSizeP > 0.001 ? magnetosomeSizeP : 0.065) * (1.0 + 0.3 * audioSwell);
    vec3 cubePos = chainCenter + corner * sz;
    
    vNormal = normalize(corner);
    vCol = imgPalette(fract(chainIdx * 0.08 + magnetosomeIdx * 0.03 + audioCentroid));
    
    // Camera Transform (V3).  Spin BEFORE the translate: applied after
    // it, the scene orbits around the CAMERA (radius = the z offset) and
    // spends most of the revolution outside the frustum.
    vec3 vp = cubePos;

    // 3D rotation
    float c = cos(t * 0.15), sn = sin(t * 0.15);
    vp = vec3(vp.x * c - vp.z * sn, vp.y, vp.x * sn + vp.z * c);
    vp.z += 4.8;
    vp.x -= eyeOff;
    
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
