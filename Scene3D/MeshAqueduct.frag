#version 330 core
out vec4 fragColor;
/**
 * @file MeshAqueduct.frag
 * @brief MESH AQUEDUCT: a real Roman aqueduct (model=) striding across a
 * valley in the late afternoon. Each arch is lit from beneath by one
 * chroma class, water glitters in the channel along the top, swifts
 * cross the openings as round silhouettes, the daylight follows the swell.
 * The mesh counterpart of the procedural AqueductArchesValley.
 *
 * Audio Reactivity:
 *   audioChroma[12] -> the light under each arch (light)
 *   audioHigh       -> water glitter in the channel (light)
 *   audioSwell      -> daylight (slow)
 *   time            -> the water and the swifts (continuous)
 *
 * Per-instance: sizeP, yawP. Per-activation variety: hueP.
 */

uniform sampler2DArray texMeshMaterial;
uniform int   texMeshMaterialLayers;

uniform float time;
uniform float sceneTime;
uniform float audioChroma[12];
uniform float audioHigh;
uniform float audioSwell;

uniform float hueP;

in vec2  vUV;
in vec3  vNormal;
in vec3  vPos;
in vec3  vLocal;
in float vBg;
in float vInst;

const float kDist   = 92.0;
const float kGround = -14.0;

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
    for (int i = 0; i < 5; i++) { v += a * noise2(p); p = R * p * 2.03 + 7.1; a *= 0.5; }
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

const vec3 kKeyDir = vec3(0.5, 0.55, -0.65);   // the sun, behind the camera's right shoulder

vec3 renderSky(vec3 dir)
{
    float swell = clamp(audioSwell, 0.0, 1.0);
    float high  = clamp(audioHigh, 0.0, 1.0);
    float day = 0.75 + 0.35 * swell;
    vec3 col;
    if (dir.y < -0.004)
    {
        // The valley floor: meadow, and a river running behind the piers.
        float t = kGround / dir.y;
        vec3 P = dir * t;
        float haze = exp(-t * 0.004);
        float g = fbm2(P.xz * 0.05), g2 = fbm2(P.xz * 0.4);
        vec3 meadow = mix(vec3(0.12, 0.20, 0.06), vec3(0.30, 0.34, 0.10), g) * (0.7 + 0.5 * g2);
        float river = 1.0 - smoothstep(5.0, 9.0, abs(P.z - (kDist + 42.0) + 6.0 * sin(P.x * 0.03)));
        float glit = pow(noise2(P.xz * 0.6 + vec2(time * 0.7, 0.0)), 6.0) * (0.4 + 1.2 * high);
        vec3 water = vec3(0.25, 0.40, 0.55) + vec3(1.0, 0.95, 0.8) * glit;
        col = mix(meadow, water, river) * day;
        col = mix(vec3(0.55, 0.60, 0.70) * day, col, haze);
    }
    else
    {
        float h = clamp(dir.y, 0.0, 1.0);
        col = mix(vec3(0.85, 0.75, 0.62), vec3(0.30, 0.48, 0.80), pow(h, 0.55)) * day;
        // Clouds, drifting.
        vec2 cp = dir.xz / max(dir.y, 0.05) * 0.5 + vec2(time * 0.006, 0.0);
        float cl = smoothstep(0.50, 0.72, fbm2(cp));
        col = mix(col, vec3(1.0, 0.97, 0.92) * day, cl * smoothstep(0.02, 0.15, h));
        // The far side of the valley.
        float az = atan(dir.x, dir.z);
        float hill = 0.06 + 0.07 * noise1(az * 2.5 + 1.0) + 0.03 * noise1(az * 9.0);
        float hillMask = 1.0 - smoothstep(hill - 0.008, hill + 0.008, dir.y);
        col = mix(col, mix(vec3(0.16, 0.24, 0.16), vec3(0.45, 0.50, 0.55), 0.5) * day * 0.7, hillMask);
    }
    // Swifts: round silhouettes crossing the openings on their own smooth arcs.
    float dark = 0.0;
    for (int i = 0; i < 12; i++)
    {
        float fi = float(i);
        float ax = 0.55 * sin(time * (0.23 + 0.05 * hash11(fi)) + fi * 1.7);
        float ay = 0.14 + 0.12 * sin(time * (0.31 + 0.04 * hash11(fi + 3.0)) + fi * 2.3);
        vec3 sd = normalize(vec3(sin(ax) * cos(ay), sin(ay), cos(ax) * cos(ay)));
        dark += 1.0 - smoothstep(0.004, 0.007, distance(dir, sd));
    }
    col *= 1.0 - clamp(dark, 0.0, 1.0) * 0.85;
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
    float high  = clamp(audioHigh, 0.0, 1.0);

    vec4 base = texture(texMeshMaterial, vec3(vUV, 0.0));
    if (base.a < 0.1) discard;
    float roughness = 0.8, metallic = 0.0;
    if (texMeshMaterialLayers >= 2)
    {
        vec4 mr = texture(texMeshMaterial, vec3(vUV, 1.0));
        roughness = mr.g; metallic = mr.b;
    }
    vec3 n = normalize(vNormal);
    n = perturbNormal(texMeshMaterial, texMeshMaterialLayers, vUV, n, vPos, 1.0);
    vec3 viewDir = normalize(-vPos);
    vec3 alb = base.rgb * materialExposure(texMeshMaterial);

    // Afternoon sun, sky fill, meadow bounce.
    vec3 keyDir = normalize(kKeyDir);
    float day = 0.75 + 0.35 * swell;
    vec3 col = alb * vec3(1.0, 0.9, 0.75) * max(dot(n, keyDir), 0.0) * 1.3 * day;
    col += alb * vec3(0.35, 0.45, 0.65) * (0.55 + 0.45 * n.y) * 0.5 * day;
    col += alb * vec3(0.25, 0.30, 0.12) * max(-n.y, 0.0) * 0.5 * day;
    col += alb * 0.05;

    // One chroma class per arch (two lower arches per segment, seven
    // segments), lighting the stone from beneath: the downward and inward
    // faces inside the openings.
    int idx = (int(vInst + 0.5) * 2 + ((vLocal.x > 0.0) ? 1 : 0)) % 12;
    float speak = clamp(audioChroma[idx] * 1.3, 0.0, 1.0);
    float under = smoothstep(0.25, -0.5, n.y) * smoothstep(-0.95, -0.6, vLocal.y);
    vec3 archCol = hsv2rgb(vec3(float(idx) / 12.0, 0.75, 1.0));
    col += alb * archCol * under * speak * 1.6;
    col += archCol * under * speak * 0.15;

    // The water in the channel along the top.
    float top = smoothstep(0.75, 0.95, n.y) * smoothstep(0.70, 0.90, vLocal.y);
    float flow = noise2(vec2(vLocal.x * 40.0 - sceneTime * 1.5, vLocal.z * 12.0));
    float glit = pow(noise2(vec2(vLocal.x * 90.0 - sceneTime * 3.0, vLocal.z * 30.0)), 5.0);
    vec3 water = vec3(0.20, 0.42, 0.55) * (0.6 + 0.5 * flow) + vec3(1.0, 0.97, 0.85) * glit * (0.5 + 1.5 * high);
    col = mix(col, water * day, top * 0.85);

    // A little sheen on the stone from the sun.
    vec3 halfV = normalize(keyDir + viewDir);
    float spec = pow(max(dot(n, halfV), 0.0), mix(40.0, 6.0, roughness));
    col += mix(vec3(1.0, 0.95, 0.85), base.rgb, metallic) * spec * 0.15 * day;

    if (hue > 0.001) col = hueRot(col, 0.10 * sin(hue));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.30 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
