#version 330 core
/**
 * @file MeshSandSculpture.vert
 * @brief MESH SAND SCULPTURE: a model carved in sand on the beach.  The
 * roughness of the sound is the wind that erodes it: the surface sinks
 * along its normal by a noise field scaled by the roughness (slow), and
 * over the scene arc the sculpture is rebuilt -- the erosion allowance
 * closes toward the end so it stands whole again.  It turns slowly on the
 * scene clock.  No camera motion.
 */
in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform float sceneAdvance;
uniform float sceneTime;
uniform float sceneProgress;
uniform float audioRoughness;
uniform int   meshVertexCount;
uniform vec3  meshExtent;
uniform vec3  meshCenter;

uniform float sizeP;
uniform float erodeP;

out vec2 vUV;
out vec3 vNormal;
out vec3 vObj;
out vec3 vPos;
out float vBg;
out float vErode;

float hash31(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float noise3(vec3 p)
{
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n000 = hash31(i), n100 = hash31(i + vec3(1, 0, 0)), n010 = hash31(i + vec3(0, 1, 0)), n110 = hash31(i + vec3(1, 1, 0));
    float n001 = hash31(i + vec3(0, 0, 1)), n101 = hash31(i + vec3(1, 0, 1)), n011 = hash31(i + vec3(0, 1, 1)), n111 = hash31(i + vec3(1, 1, 1));
    return mix(mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y), mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
}

void main()
{
    bool isBg = gl_VertexID >= meshVertexCount;
    if (isBg)
    {
        vec3 w = attrA.xyz;
        vNormal = normalize(attrB.xyz);
        vPos = w; vObj = w; vUV = vec2(0.0); vBg = 1.0; vErode = 0.0;
        vec3 vp = vec3(w.x - eyeOff, w.y, w.z);
        gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
        gl_Position.z = gl_Position.w * 0.999999;
        return;
    }
    vec3 p = attrA.xyz - meshCenter;
    vec3 n = normalize(attrB.xyz);
    float rad = max(length(meshExtent), 1e-4);
    p /= rad;
    vObj = p;
    // Erosion: roughness (slow) times the arc allowance, times a wind-side
    // noise (the windward side erodes more).
    float prog = clamp(sceneProgress, 0.0, 1.0);
    float allow = smoothstep(0.0, 0.3, prog) * (1.0 - smoothstep(0.7, 1.0, prog));
    float rough = clamp(audioRoughness * 1.5, 0.0, 1.0);
    float windSide = 0.5 + 0.5 * dot(n, normalize(vec3(-0.7, 0.2, -0.4)));
    float field = noise3(p * 4.0 + sceneAdvance * 0.02) * 0.7 + noise3(p * 9.0) * 0.3;
    float erode = (0.05 + 0.25 * clamp(erodeP, 0.0, 1.0)) * rough * allow * (0.3 + 0.7 * windSide) * field;
    p -= n * erode;
    vErode = erode / 0.3;
    float ry = sceneAdvance * 0.08 + sceneTime * 0.02;
    float rx = 0.2;
    mat3 RY = mat3(cos(ry), 0.0, -sin(ry), 0.0, 1.0, 0.0, sin(ry), 0.0, cos(ry));
    mat3 RX = mat3(1.0, 0.0, 0.0, 0.0, cos(rx), sin(rx), 0.0, -sin(rx), cos(rx));
    p = RX * RY * p;
    n = RX * RY * n;
    float size = 6.0 * (sizeP > 0.05 ? sizeP : 1.0);
    vec3 world = p * size + vec3(0.0, -0.5, 12.0);
    vUV = vec2(attrA.w, attrB.w);
    vNormal = n;
    vPos = world;
    vBg = 0.0;
    vec3 vp = vec3(world.x - eyeOff, world.y, world.z);
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
