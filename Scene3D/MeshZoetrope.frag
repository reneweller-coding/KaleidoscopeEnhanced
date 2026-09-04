#version 330 core
out vec4 fragColor;
/**
 * @file MeshZoetrope.frag
 * @brief MESH ZOETROPE: a real Victorian zoetrope (model=) on a parlour
 * table, its drum turning on its spindle while the base stands still. An
 * oil lamp lights the room with the swell; the strip of figures inside
 * glows through the slits; the kick is a flare of the lamp; the treble a
 * sheen on the japanned tin. The mesh counterpart of ZoetropeDrum.
 *
 * Audio Reactivity:
 *   audioSwell -> lamp light, the glow of the strip (slow)
 *   audioKick  -> lamp flare (light)
 *   audioHigh  -> sheen on the tin (light)
 *   time       -> the spin (continuous, vertex stage)
 *
 * Per-instance: sizeP, rateP, splitP. Per-activation variety: hueP.
 */

uniform sampler2DArray texMeshMaterial;
uniform int   texMeshMaterialLayers;

uniform float time;
uniform float audioSwell;
uniform float audioKick;
uniform float audioHigh;

uniform float hueP;

in vec2  vUV;
in vec3  vNormal;
in vec3  vPos;
in vec3  vLocal;
in float vBg;
in float vDrum;

const float kDist   = 50.0;
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
    float kick  = clamp(audioKick, 0.0, 1.0);
    float lamp = 0.45 + 0.6 * swell + 0.3 * kick;
    float az = atan(dir.x, dir.z);
    vec3 col;
    if (dir.y < -0.004)
    {
        // The table: polished walnut, the lamp's warmth on it.
        float t = kGround / dir.y;
        vec3 P = dir * t;
        float haze = exp(-t * 0.010);
        float grain = 0.7 + 0.4 * noise2(vec2(P.x * 0.35, P.z * 3.0));
        col = vec3(0.26, 0.15, 0.08) * grain * lamp;
        col += vec3(1.0, 0.8, 0.5) * exp(-length(P.xz - vec2(-18.0, 40.0)) * 0.05) * 0.25 * lamp;
        col = mix(vec3(0.02), col, haze);
    }
    else
    {
        // Damask wallpaper, red and gold, dim toward the ceiling.
        float h = clamp(dir.y, 0.0, 1.0);
        vec2 wp = vec2(az * 9.0, dir.y * 12.0);
        float damask = smoothstep(0.45, 0.6, fbm2(wp * 1.5)) * 0.5;
        vec3 wall = mix(vec3(0.30, 0.06, 0.05), vec3(0.45, 0.32, 0.10), damask);
        col = wall * lamp * exp(-h * 2.8) * 0.9;
        // The oil lamp, upper left.
        col += vec3(1.0, 0.8, 0.5) * exp(-distance(dir, normalize(vec3(-0.45, 0.45, 0.9))) * 4.5) * 0.35 * lamp;
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
    float lamp  = 0.45 + 0.6 * swell + 0.3 * kick;

    vec4 base = texture(texMeshMaterial, vec3(vUV, 0.0));
    if (base.a < 0.1) discard;
    float roughness = 0.45, metallic = 0.3;
    if (texMeshMaterialLayers >= 2)
    {
        vec4 mr = texture(texMeshMaterial, vec3(vUV, 1.0));
        roughness = mr.g; metallic = mr.b;
    }
    vec3 n = normalize(vNormal);
    n = perturbNormal(texMeshMaterial, texMeshMaterialLayers, vUV, n, vPos, 1.0);
    vec3 viewDir = normalize(-vPos);
    vec3 alb = base.rgb * materialExposure(texMeshMaterial);

    vec3 lampDir = normalize(vec3(-0.55, 0.5, -0.5));
    vec3 col = alb * vec3(1.0, 0.82, 0.55) * max(dot(n, lampDir), 0.0) * 1.2 * lamp;
    col += alb * vec3(0.30, 0.12, 0.10) * (0.55 + 0.45 * n.y) * 0.5 * lamp;
    col += alb * 0.05;

    vec3 halfV = normalize(lampDir + viewDir);
    float spec = pow(max(dot(n, halfV), 0.0), mix(90.0, 8.0, roughness));
    col += mix(vec3(1.0, 0.9, 0.7), base.rgb, metallic) * spec * (0.3 + 0.7 * metallic) * (0.6 + 1.0 * high) * lamp;

    // The strip of figures inside: the pale paper texels of the drum glow
    // with the lamp, seen through the slits.
    float luma = dot(base.rgb, vec3(0.299, 0.587, 0.114));
    float mx = max(base.r, max(base.g, base.b));
    float mn = min(base.r, min(base.g, base.b));
    float paper = smoothstep(0.5, 0.75, luma) * (1.0 - smoothstep(0.2, 0.4, (mx - mn) / max(mx, 1e-3))) * vDrum;
    col += vec3(1.0, 0.9, 0.7) * paper * (0.25 + 0.6 * swell);

    float fres = pow(1.0 - max(dot(n, viewDir), 0.0), 4.0);
    col += vec3(1.0, 0.7, 0.45) * fres * 0.15 * lamp;

    if (hue > 0.001) col = hueRot(col, 0.06 * sin(hue));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.30 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
