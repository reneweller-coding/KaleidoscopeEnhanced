#version 330 core
out vec4 fragColor;
/**
 * @file MeshPendulumWave.frag
 * @brief MESH PENDULUM WAVE: twelve real pendulums (one model,
 * instances="12") hanging from a rail in a dark lab, swinging the
 * pendulum-wave pattern on time. The bob glows with the bass; the bob
 * passing through centre lights on the beat; the swell is the lamp. The
 * mesh counterpart of the procedural PendulumWaveTempo.
 *
 * Audio Reactivity:
 *   audioBeat  -> highlight on the bob passing centre (light)
 *   audioBass  -> bob glow (light)
 *   audioSwell -> lamp brightness, swing amplitude (slow)
 *   time       -> the swings (continuous, vertex stage)
 *
 * Per-instance: sizeP, cycleP. Per-activation variety: hueP.
 */

uniform sampler2DArray texMeshMaterial;
uniform int   texMeshMaterialLayers;

uniform float time;
uniform float audioBeat;
uniform float audioBass;
uniform float audioSwell;

uniform float hueP;

in vec2  vUV;
in vec3  vNormal;
in vec3  vPos;
in vec3  vLocal;
in float vBg;
in float vInst;
in float vSwing;

const float kDist   = 70.0;
const float kPivotY = 26.0;
const float kGround = -20.0;

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
    vec3 col;
    if (dir.y < -0.004)
    {
        // The lab floor: dark tiles, a faint grid.
        float t = kGround / dir.y;
        vec3 P = dir * t;
        float haze = exp(-t * 0.008);
        float grid = 1.0 - smoothstep(0.0, 0.06, min(abs(fract(P.x / 10.0) - 0.5), abs(fract(P.z / 10.0) - 0.5)) - 0.44);
        col = vec3(0.10, 0.11, 0.13) * (0.7 + 0.4 * noise2(P.xz * 0.2)) + vec3(0.06) * grid;
        col *= 0.4 + 0.6 * swell;
        col = mix(vec3(0.02), col, haze);
    }
    else
    {
        // The wall, and the rail the pendulums hang from.
        float az = atan(dir.x, dir.z);
        float h = clamp(dir.y, 0.0, 1.0);
        col = vec3(0.14, 0.15, 0.18) * (0.6 + 0.6 * fbm2(vec2(az * 6.0, dir.y * 8.0))) * exp(-h * 2.5);
        float railE = atan(kPivotY + 1.5, kDist);
        float rail = 1.0 - smoothstep(0.004, 0.009, abs(dir.y - railE));
        col += vec3(0.6, 0.6, 0.65) * rail * 0.6;
        col *= 0.4 + 0.6 * swell;
        col += vec3(1.0, 0.9, 0.75) * exp(-distance(dir, normalize(vec3(0.0, 0.8, 1.0))) * 4.0) * 0.14 * (0.5 + 0.5 * swell);
    }
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
    float beat  = clamp(audioBeat, 0.0, 1.0);
    float bass  = clamp(audioBass, 0.0, 1.0);

    vec4 base = texture(texMeshMaterial, vec3(vUV, 0.0));
    if (base.a < 0.1) discard;
    float roughness = 0.4, metallic = 0.6;
    if (texMeshMaterialLayers >= 2)
    {
        vec4 mr = texture(texMeshMaterial, vec3(vUV, 1.0));
        roughness = mr.g; metallic = mr.b;
    }
    vec3 n = normalize(vNormal);
    n = perturbNormal(texMeshMaterial, texMeshMaterialLayers, vUV, n, vPos, 1.0);
    vec3 viewDir = normalize(-vPos);
    vec3 alb = base.rgb * materialExposure(texMeshMaterial);

    vec3 lampDir = normalize(vec3(0.0, 0.8, -0.6));
    vec3 col = alb * vec3(1.0, 0.92, 0.8) * max(dot(n, lampDir), 0.0) * (0.9 + 0.8 * swell);
    col += alb * vec3(0.18, 0.19, 0.24) * (0.55 + 0.45 * n.y) * 0.6;
    col += alb * 0.05;

    vec3 halfV = normalize(lampDir + viewDir);
    float spec = pow(max(dot(n, halfV), 0.0), mix(90.0, 8.0, roughness));
    col += mix(vec3(1.0, 0.95, 0.85), base.rgb, metallic) * spec * (0.4 + 0.8 * metallic);

    // The bob glows with the bass; the pendulum passing through centre
    // lights on the beat.
    float bob = smoothstep(-0.45, -0.7, vLocal.y);
    col += vec3(1.0, 0.7, 0.35) * bob * (0.05 + 0.6 * bass);
    float centre = 1.0 - smoothstep(0.0, 0.25, abs(vSwing));
    col += vec3(0.8, 0.9, 1.0) * centre * beat * 0.9;

    float fres = pow(1.0 - max(dot(n, viewDir), 0.0), 4.0);
    col += vec3(0.9, 0.9, 1.0) * fres * 0.12;

    if (hue > 0.001) col = hueRot(col, 0.08 * sin(hue));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.30 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
