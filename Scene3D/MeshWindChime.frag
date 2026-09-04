#version 330 core
out vec4 fragColor;
/**
 * @file MeshWindChime.frag
 * @brief MESH WIND CHIME: a real wind chime (model=) hanging under a porch
 * roof, the afternoon garden beyond. It sways in the breeze on time; a tube
 * does not move when its note sounds, it RINGS: it brightens in its class
 * colour and throws a halo of rings across the garden behind it. Which
 * tube is which class comes from its place round the disc. The kick is
 * the clapper's glint, the treble the sheen on the metal, the swell the
 * afternoon light. The mesh counterpart of the procedural WindChimeTubes.
 *
 * Audio Reactivity:
 *   audioChroma[12] -> which tubes ring, and their halos (light)
 *   audioKick       -> the clapper's glint (light)
 *   audioHigh       -> the metal sheen (light)
 *   audioSwell      -> afternoon light, sway amplitude (slow)
 *   time            -> the sway (continuous, vertex stage)
 *
 * Per-instance: sizeP, swayP. Per-activation variety: hueP.
 */

uniform sampler2DArray texMeshMaterial;
uniform int   texMeshMaterialLayers;

uniform float time;
uniform float sceneTime;
uniform float audioChroma[12];
uniform float audioKick;
uniform float audioHigh;
uniform float audioSwell;

uniform float hueP;

in vec2  vUV;
in vec3  vNormal;
in vec3  vPos;
in vec3  vLocal;
in float vBg;

const float kDist   = 52.0;
const float kGround = -30.0;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}
vec3 hsv2rgb(vec3 c) {
    vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
    return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float hash11(float p) { return fract(sin(p * 12.9898) * 43758.5453); }
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
float noise1(float x) {
    float i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(hash11(i), hash11(i + 1.0), f);
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

const vec3 kSunDir = vec3(-0.45, 0.55, -0.70);   // afternoon sun, behind the camera's left

vec3 renderSky(vec3 dir)
{
    float swell = clamp(audioSwell, 0.0, 1.0);
    float day = 0.8 + 0.3 * swell;
    float az = atan(dir.x, dir.z);
    vec3 col;
    if (dir.y > 0.30)
    {
        // The porch roof: dark boards.
        float t = 30.0 / dir.y;
        vec3 P = dir * t;
        float board = smoothstep(0.0, 0.04, abs(fract(P.x / 6.0) - 0.5) - 0.46);
        col = vec3(0.16, 0.10, 0.06) * (0.6 + 0.4 * board) * (0.5 + 0.5 * noise2(P.xz * 0.4)) * (0.5 + 0.5 * swell);
        col = mix(col, vec3(0.30, 0.22, 0.14) * day, smoothstep(0.30, 0.36, dir.y) * 0.0);
    }
    else if (dir.y < -0.004)
    {
        // The lawn.
        float t = kGround / dir.y;
        vec3 P = dir * t;
        float haze = exp(-t * 0.005);
        float g = fbm2(P.xz * 0.06), g2 = fbm2(P.xz * 0.5);
        vec3 grass = mix(vec3(0.10, 0.22, 0.05), vec3(0.22, 0.38, 0.08), g) * (0.75 + 0.5 * g2) * day;
        col = mix(vec3(0.55, 0.65, 0.75) * day, grass, haze);
    }
    else
    {
        float h = clamp(dir.y, 0.0, 1.0);
        col = mix(vec3(0.80, 0.85, 0.90), vec3(0.35, 0.55, 0.90), pow(h / 0.3, 0.6)) * day;
        float tree = 0.05 + 0.06 * noise1(az * 3.5) + 0.02 * noise1(az * 12.0 + 5.0);
        float treeMask = 1.0 - smoothstep(tree - 0.006, tree + 0.006, dir.y);
        col = mix(col, vec3(0.06, 0.14, 0.05) * day, treeMask);
    }
    // Halos of the ringing tubes, thrown across the garden behind the chime.
    vec3 d = normalize(vec3(0.0, 4.0, kDist));
    float a = acos(clamp(dot(dir, d), -1.0, 1.0));
    for (int i = 0; i < 12; i++)
    {
        float ci = clamp(audioChroma[i] * 1.3, 0.0, 1.0);
        if (ci < 0.03) continue;
        float ring = pow(0.5 + 0.5 * cos(a * 30.0 - sceneTime * 4.0 - float(i) * 0.5), 6.0);
        col += hsv2rgb(vec3(float(i) / 12.0, 0.5, 1.0)) * ring * exp(-a * 5.0) * ci * 0.25;
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
    float kick  = clamp(audioKick, 0.0, 1.0);
    float high  = clamp(audioHigh, 0.0, 1.0);
    float day   = 0.8 + 0.3 * swell;

    vec4 base = texture(texMeshMaterial, vec3(vUV, 0.0));
    if (base.a < 0.1) discard;
    float roughness = 0.4, metallic = 0.3;
    if (texMeshMaterialLayers >= 2)
    {
        vec4 mr = texture(texMeshMaterial, vec3(vUV, 1.0));
        roughness = mr.g; metallic = mr.b;
    }
    vec3 n = normalize(vNormal);
    n = perturbNormal(texMeshMaterial, texMeshMaterialLayers, vUV, n, vPos, 1.0);
    vec3 viewDir = normalize(-vPos);
    vec3 alb = base.rgb * materialExposure(texMeshMaterial);

    vec3 sd = normalize(kSunDir);
    vec3 col = alb * vec3(1.0, 0.92, 0.8) * max(dot(n, sd), 0.0) * 1.3 * day;
    col += alb * vec3(0.40, 0.55, 0.85) * (0.55 + 0.45 * n.y) * 0.5 * day;
    col += alb * vec3(0.15, 0.25, 0.08) * max(-n.y, 0.0) * 0.5 * day;
    col += alb * 0.05;

    vec3 halfV = normalize(sd + viewDir);
    float spec = pow(max(dot(n, halfV), 0.0), mix(90.0, 8.0, roughness));
    col += mix(vec3(1.0), base.rgb, metallic) * spec * (0.3 + 0.7 * metallic) * (0.6 + 1.2 * high);

    // Which tube: its place round the disc gives its class.
    float rad = length(vLocal.xz);
    float tube = smoothstep(0.22, 0.40, rad) * smoothstep(-0.55, -0.25, vLocal.y) * (1.0 - smoothstep(0.75, 0.95, vLocal.y)) * smoothstep(0.2, 0.6, metallic);
    int idx = int(clamp((atan(vLocal.x, vLocal.z) / 6.2831853 + 0.5) * 12.0, 0.0, 11.99));
    float speak = clamp(audioChroma[idx] * 1.3, 0.0, 1.0);
    vec3 classCol = hsv2rgb(vec3(float(idx) / 12.0, 0.5, 1.0));
    col += classCol * tube * speak * 0.9;

    // The clapper in the middle: its glint on the kick.
    float clapper = (1.0 - smoothstep(0.15, 0.30, rad)) * smoothstep(-0.9, -0.5, vLocal.y) * (1.0 - smoothstep(0.1, 0.4, vLocal.y));
    col += vec3(1.0, 0.95, 0.85) * clapper * kick * 0.8;

    float fres = pow(1.0 - max(dot(n, viewDir), 0.0), 4.0);
    col += vec3(0.8, 0.9, 1.0) * fres * 0.15 * day;

    if (hue > 0.001) col = hueRot(col, 0.08 * sin(hue));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.30 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
