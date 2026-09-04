#version 330 core
out vec4 fragColor;
/**
 * @file MeshPipeOrgan.frag
 * @brief MESH PIPE ORGAN: a real baroque organ case (model=) in a dark
 * church, lit by candlelight from below, and the music is in its pipes: the
 * silver pipe metal is picked out of the material (metallic, unsaturated),
 * each pipe's place across the front gives it a pitch class, and the pipe
 * SPEAKS -- glows, with a shimmer running up its speaking length -- when
 * that class sounds (audioChroma). The kick brings the tallest pipes up like
 * the pedal rank, the swell is the swell box, literally: the whole case
 * brightens. High behind the case a rose window with twelve petals, one per
 * pitch class, lit the same way. The gilding catches the candles. Nothing
 * moves but light; the camera's rig sweep carries the shot. The counterpart
 * of the procedural PipeOrganChroma.
 *
 * Audio Reactivity:
 *   audioChroma[12] -> which pipes speak, which petals light (light)
 *   audioKick       -> the pedal rank (light)
 *   audioSwell      -> swell-box light (slow)
 *   audioHigh       -> the shimmer on the speaking length (light)
 *
 * Per-instance: sizeP, yawP. Per-activation variety: hueP.
 */

uniform sampler2DArray texMeshMaterial;
uniform int   texMeshMaterialLayers;

uniform float time;
uniform float audioChroma[12];
uniform float audioKick;
uniform float audioSwell;
uniform float audioHigh;

uniform float hueP;

in vec2  vUV;
in vec3  vNormal;
in vec3  vPos;
in vec3  vLocal;
in float vBg;

const float kDist   = 64.0;
const float kGround = -23.0;

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

vec3 lightAt(vec3 P, vec3 n, vec3 lp, vec3 lc, float range)
{
    vec3 d = lp - P;
    float dist = length(d);
    d /= max(dist, 1e-3);
    float att = 1.0 / (1.0 + (dist * dist) / (range * range));
    return lc * max(dot(n, d), 0.0) * att;
}

// Candles: two warm point lights low in front of the case.
const vec3 kCandleA = vec3(-16.0, kGround + 3.0, kDist - 22.0);
const vec3 kCandleB = vec3( 14.0, kGround + 2.0, kDist - 26.0);

vec3 renderSky(vec3 dir)
{
    float swell = clamp(audioSwell, 0.0, 1.0);
    float az = atan(dir.x, dir.z);
    vec3 col;
    if (dir.y < -0.004)
    {
        // A flagstone floor, warm near the candles, dark far off.
        float t = kGround / dir.y;
        vec3 P = dir * t;
        float haze = exp(-t * 0.008);
        float chk = mod(floor(P.x / 7.0) + floor(P.z / 7.0), 2.0);
        vec3 stone = mix(vec3(0.16, 0.13, 0.10), vec3(0.09, 0.08, 0.07), chk) * (0.7 + 0.6 * fbm2(P.xz * 0.3));
        float warmA = exp(-length(P.xz - kCandleA.xz) * 0.035);
        float warmB = exp(-length(P.xz - kCandleB.xz) * 0.035);
        col = stone * (0.25 + 1.6 * (warmA + warmB) * (0.6 + 0.5 * swell));
        col = mix(vec3(0.02, 0.015, 0.01), col, haze);
    }
    else
    {
        // Sandstone walls with pilasters, candlelight from below dying
        // into a dark vault.
        float h = clamp(dir.y, 0.0, 1.0);
        vec3 wall = vec3(0.20, 0.16, 0.12) * (0.6 + 0.6 * fbm2(vec2(az * 6.0, dir.y * 9.0)));
        float pil = smoothstep(0.42, 0.47, abs(fract(az * 2.2) - 0.5));
        wall *= 0.75 + 0.35 * pil;
        float dark = exp(-h * 4.5);
        col = wall * (0.05 + 0.9 * dark * (0.7 + 0.4 * swell));

        // The rose window: twelve petals, one per pitch class. It has to sit
        // in the strip between the top of the case (about 18 degrees up at
        // this size) and the top of the frame (27.5 degrees), so it is small
        // and high: 3.8 degrees across, centred at 22.5 degrees.
        vec3 wd = normalize(vec3(0.0, 0.414, 1.0));
        float wdist = distance(dir, wd);
        float ang = atan(dir.y - wd.y, dir.x - wd.x);
        float petal = (ang / 6.2831853 + 0.5) * 12.0;
        int k = int(mod(floor(petal), 12.0));
        float speak = clamp(audioChroma[k] * 1.3, 0.0, 1.0);
        vec3 petalCol = hsv2rgb(vec3(float(k) / 12.0, 0.65, 1.0));
        float ring = (1.0 - smoothstep(0.060, 0.067, wdist)) * smoothstep(0.009, 0.015, wdist);
        float mull = smoothstep(0.04, 0.09, abs(fract(petal) - 0.5));
        float spokes = smoothstep(0.0025, 0.005, abs(wdist - 0.038));
        col += petalCol * ring * mull * spokes * (0.15 + 1.0 * speak);
        col += vec3(0.5, 0.4, 0.6) * exp(-wdist * 14.0) * 0.14;
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
    float kick  = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float high  = clamp(audioHigh, 0.0, 1.0);

    vec4 base = texture(texMeshMaterial, vec3(vUV, 0.0));
    if (base.a < 0.1) discard;
    float roughness = 0.55, metallic = 0.1;
    bool hasMR = texMeshMaterialLayers >= 2;
    if (hasMR)
    {
        vec4 mr = texture(texMeshMaterial, vec3(vUV, 1.0));
        roughness = mr.g; metallic = mr.b;
    }

    vec3 n = normalize(vNormal);
    n = perturbNormal(texMeshMaterial, texMeshMaterialLayers, vUV, n, vPos, 1.0);
    vec3 viewDir = normalize(-vPos);
    float expose = materialExposure(texMeshMaterial);
    vec3 alb = base.rgb * expose;

    // Candlelight from below, moonlight from a high window (cool, so the
    // pipe metal reads as silver and not as more candle-orange wood), a
    // faint fill from the vault.
    vec3 candleCol = vec3(1.0, 0.72, 0.42) * (1.4 + 1.2 * swell);
    vec3 cand = lightAt(vPos, n, kCandleA, candleCol, 40.0) + lightAt(vPos, n, kCandleB, candleCol, 40.0);
    vec3 moonDir = normalize(vec3(-0.35, 0.75, -0.55));
    vec3 moon = vec3(0.40, 0.48, 0.70) * max(dot(n, moonDir), 0.0) * 0.9;
    vec3 col = alb * (cand + moon + vec3(0.10, 0.10, 0.14) * (0.5 + 0.5 * n.y) + 0.05);

    // The gilding and the pipe metal catch the candles and the moon.
    vec3 hA = normalize(normalize(kCandleA - vPos) + viewDir);
    vec3 hB = normalize(normalize(kCandleB - vPos) + viewDir);
    vec3 hM = normalize(moonDir + viewDir);
    float shin = mix(70.0, 6.0, roughness);
    float spec = pow(max(dot(n, hA), 0.0), shin) + pow(max(dot(n, hB), 0.0), shin);
    float specM = pow(max(dot(n, hM), 0.0), shin);
    vec3 specColor = mix(vec3(1.0, 0.9, 0.75), base.rgb, metallic);
    col += specColor * spec * (0.3 + 0.7 * metallic) * (0.5 + 0.5 * swell);
    col += mix(vec3(0.7, 0.8, 1.0), base.rgb, metallic) * specM * (0.3 + 0.7 * metallic) * 0.8;

    // Which texels are pipe metal: metallic and unsaturated (silver), or --
    // without a metallic map -- simply bright and unsaturated.
    float mx = max(base.r, max(base.g, base.b));
    float mn = min(base.r, min(base.g, base.b));
    float sat = (mx - mn) / max(mx, 1e-3);
    float luma = dot(base.rgb, vec3(0.299, 0.587, 0.114));
    float pipe = hasMR ? smoothstep(0.30, 0.65, metallic) * (1.0 - smoothstep(0.20, 0.45, sat))
                       : smoothstep(0.30, 0.55, luma) * (1.0 - smoothstep(0.15, 0.35, sat));

    // The pipe's pitch class from its place across the front.
    int idx = int(clamp((vLocal.x * 0.5 + 0.5) * 12.0, 0.0, 11.99));
    float speak = clamp(audioChroma[idx] * 1.3, 0.0, 1.0);
    float shim = 0.5 + 0.5 * sin(vLocal.y * 14.0 - time * 3.0);
    vec3 speakCol = hsv2rgb(vec3(float(idx) / 12.0, 0.35, 1.0));
    col += speakCol * pipe * speak * (0.6 + 0.6 * shim * (0.5 + 0.5 * high));
    // The pedal rank: the tallest pipes come up on the kick.
    col += vec3(1.0, 0.85, 0.6) * pipe * smoothstep(0.1, 0.8, vLocal.y) * kick * 0.7;

    float fres = pow(1.0 - max(dot(n, viewDir), 0.0), 4.0);
    col += vec3(1.0, 0.7, 0.45) * fres * 0.10 * (0.5 + 0.5 * swell);

    if (hue > 0.001) col = hueRot(col, 0.12 * sin(hue));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.30 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
