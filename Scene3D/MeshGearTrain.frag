#version 330 core
out vec4 fragColor;
/**
 * @file MeshGearTrain.frag
 * @brief MESH GEAR TRAIN: seven real brass gears (one model,
 * instances="7") meshing across the frame inside a dark clockwork, turning
 * steadily, neighbours counter-rotating. Teeth catch the lamp as they
 * pass; the kick throws sparks at the meshing points; the swell warms the
 * brass. The mesh counterpart of the procedural TempoGearwork (which
 * locked its angles to the bar clock; here the rate is steady, so nothing
 * can jolt).
 *
 * Audio Reactivity:
 *   audioKick  -> sparks at the meshing points (light)
 *   audioSwell -> the lamp warms the brass (slow)
 *   audioHigh  -> tooth glints (light)
 *   time       -> the rotation (continuous, vertex stage)
 *
 * Per-instance: sizeP, rateP. Per-activation variety: hueP.
 */

uniform sampler2DArray texMeshMaterial;
uniform int   texMeshMaterialLayers;

uniform float time;
uniform float audioKick;
uniform float audioSwell;
uniform float audioHigh;

uniform float hueP;

in vec2  vUV;
in vec3  vNormal;
in vec3  vPos;
in vec3  vLocal;
in float vBg;
in float vInst;
in vec2  vCentre;

const float kDist = 58.0;
const float kR    = 9.0;

vec2 gearCentre(int i)
{
    float fi = float(i) - 3.0;
    return vec2(fi * 15.8, (mod(float(i), 2.0) < 0.5 ? 4.5 : -4.5));
}

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise2(vec2 x) {
    vec2 i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i), b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm2(vec2 p) {
    float v = 0.0, a = 0.5;
    const mat2 R = mat2(0.80, 0.60, -0.60, 0.80);
    for (int i = 0; i < 4; i++) { v += a * noise2(p); p = R * p * 2.03 + 7.1; a *= 0.5; }
    return v;
}
float materialExposure(sampler2DArray tex)
{
    vec3 avg = textureLod(tex, vec3(0.5, 0.5, 0.0), 20.0).rgb;
    float l = dot(avg, vec3(0.299, 0.587, 0.114));
    return clamp(0.28 / max(l, 0.02), 0.60, 1.8);
}
mat3 cotangentFrame(vec3 N, vec3 p, vec2 uv)
{
    vec3 dp1 = dFdx(p),  dp2 = dFdy(p);
    vec2 du1 = dFdx(uv), du2 = dFdy(uv);
    vec3 dp2perp = cross(dp2, N);
    vec3 dp1perp = cross(N, dp1);
    vec3 T = dp2perp * du1.x + dp1perp * du2.x;
    vec3 B = dp2perp * du1.y + dp1perp * du2.y;
    float inv = inversesqrt(max(max(dot(T, T), dot(B, B)), 1e-12));
    return mat3(T * inv, B * inv, N);
}
vec3 perturbNormal(sampler2DArray tex, int layers, vec2 uv, vec3 n, vec3 wpos, float strength)
{
    if (layers < 3) return n;
    vec3 m = texture(tex, vec3(uv, 2.0)).rgb * 2.0 - 1.0;
    if (dot(m, m) < 1e-4) return n;
    m.xy *= strength;
    return normalize(cotangentFrame(n, wpos, uv) * normalize(m));
}

vec3 renderSky(vec3 dir)
{
    float swell = clamp(audioSwell, 0.0, 1.0);
    float kick  = clamp(audioKick, 0.0, 1.0);
    // The inside of a clock: dark iron plates, a warm lamp high on the left.
    float az = atan(dir.x, dir.z);
    vec3 plate = vec3(0.10, 0.09, 0.08) * (0.6 + 0.6 * fbm2(vec2(az * 8.0, dir.y * 8.0)));
    float rivet = step(0.985, hash21(floor(vec2(az * 40.0, dir.y * 30.0)))) * 0.4;
    vec3 col = (plate + vec3(0.35, 0.28, 0.15) * rivet) * (0.3 + 0.5 * swell);
    vec3 lamp = normalize(vec3(-0.5, 0.7, 0.8));
    col += vec3(1.0, 0.75, 0.45) * exp(-distance(dir, lamp) * 3.5) * 0.25 * (0.5 + 0.5 * swell);
    // The sparks of the meshing points also light the plates, faintly.
    vec3 midDir = normalize(vec3(0.0, 0.0, kDist));
    col += vec3(1.0, 0.55, 0.2) * exp(-(1.0 - dot(dir, midDir)) * 12.0) * kick * 0.15;
    return col;
}

void main()
{
    if (vBg > 0.5)
    {
        fragColor = vec4(renderSky(normalize(vPos)), 1.0);
        return;
    }

    float hue   = (hueP > 0.01 ? hueP : 0.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float kick  = clamp(audioKick, 0.0, 1.0);
    float high  = clamp(audioHigh, 0.0, 1.0);

    vec4 base = texture(texMeshMaterial, vec3(vUV, 0.0));
    if (base.a < 0.1) discard;
    float roughness = 0.45, metallic = 0.8;
    if (texMeshMaterialLayers >= 2)
    {
        vec4 mr = texture(texMeshMaterial, vec3(vUV, 1.0));
        roughness = mr.g; metallic = mr.b;
    }
    vec3 n = normalize(vNormal);
    n = perturbNormal(texMeshMaterial, texMeshMaterialLayers, vUV, n, vPos, 1.0);
    vec3 viewDir = normalize(-vPos);
    vec3 alb = base.rgb * materialExposure(texMeshMaterial);

    vec3 lampDir = normalize(vec3(-0.5, 0.7, -0.5));
    vec3 col = alb * vec3(1.0, 0.8, 0.55) * max(dot(n, lampDir), 0.0) * (0.9 + 0.8 * swell);
    col += alb * vec3(0.18, 0.18, 0.22) * (0.55 + 0.45 * n.y) * 0.6;
    col += alb * 0.05;

    vec3 halfV = normalize(lampDir + viewDir);
    float spec = pow(max(dot(n, halfV), 0.0), mix(90.0, 8.0, roughness));
    col += mix(vec3(1.0, 0.9, 0.7), base.rgb, metallic) * spec * (0.4 + 0.8 * metallic) * (0.7 + 1.0 * high);

    // Sparks at the meshing points: on the rim, toward each neighbour, on the kick.
    int i = int(vInst + 0.5);
    vec2 rel = vPos.xy - vCentre;
    float rim = smoothstep(0.75 * kR, 0.92 * kR, length(rel));
    float phi = atan(rel.y, rel.x);
    float spark = 0.0;
    if (i > 0)
    {
        vec2 d = gearCentre(i - 1) - vCentre;
        float a = atan(d.y, d.x);
        float da = atan(sin(phi - a), cos(phi - a));
        spark += exp(-da * da / 0.03);
    }
    if (i < 6)
    {
        vec2 d = gearCentre(i + 1) - vCentre;
        float a = atan(d.y, d.x);
        float da = atan(sin(phi - a), cos(phi - a));
        spark += exp(-da * da / 0.03);
    }
    col += vec3(1.0, 0.6, 0.25) * rim * spark * kick * 1.5;

    float fres = pow(1.0 - max(dot(n, viewDir), 0.0), 4.0);
    col += vec3(1.0, 0.8, 0.5) * fres * 0.12 * (0.5 + 0.5 * swell);

    if (hue > 0.001) col = hueRot(col, 0.08 * sin(hue));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.30 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
