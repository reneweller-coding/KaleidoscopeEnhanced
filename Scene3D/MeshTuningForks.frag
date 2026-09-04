#version 330 core
out vec4 fragColor;
/**
 * @file MeshTuningForks.frag
 * @brief MESH TUNING FORKS: twelve real tuning forks (one model,
 * instances="12") in a row on a sounding board in a dark room, one per
 * pitch class. A fork RINGS when its class sounds: it glows in its class
 * colour and throws halos -- concentric rings travelling outward across
 * the wall behind it on the scene clock. The kick is the mallet striking
 * the loudest fork (a flash on that fork), the swell the room light. The
 * mesh counterpart of the procedural TuningForkChoir.
 *
 * Audio Reactivity:
 *   audioChroma[12] -> each fork's glow and its halos (light)
 *   audioKick       -> the strike on the loudest fork (light)
 *   audioSwell      -> the room light (slow)
 *   sceneTime       -> the halos travel outward (continuous)
 *
 * Per-instance: sizeP. Per-activation variety: hueP.
 */

uniform sampler2DArray texMeshMaterial;
uniform int   texMeshMaterialLayers;

uniform float time;
uniform float sceneTime;
uniform float audioChroma[12];
uniform float audioKick;
uniform float audioSwell;

uniform float hueP;

in vec2  vUV;
in vec3  vNormal;
in vec3  vPos;
in vec3  vLocal;
in float vBg;
in float vInst;

const float kDist   = 42.0;
const float kGround = -10.0;
const float kSpacing = 4.6;

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

int loudest()
{
    int best = 0; float bv = -1.0;
    for (int i = 0; i < 12; i++) { if (audioChroma[i] > bv) { bv = audioChroma[i]; best = i; } }
    return best;
}

vec3 renderSky(vec3 dir)
{
    float swell = clamp(audioSwell, 0.0, 1.0);
    vec3 col;
    if (dir.y < -0.004)
    {
        // The sounding board: spruce planks along the row.
        float t = kGround / dir.y;
        vec3 P = dir * t;
        float haze = exp(-t * 0.010);
        float plank = smoothstep(0.0, 0.03, abs(fract(P.z / 9.0) - 0.5) - 0.47);
        float grain = 0.75 + 0.35 * noise2(vec2(P.x * 0.9, P.z * 6.0));
        col = vec3(0.55, 0.40, 0.22) * grain * (0.6 + 0.4 * plank) * (0.35 + 0.5 * swell);
        col = mix(vec3(0.02), col, haze);
    }
    else
    {
        float h = clamp(dir.y, 0.0, 1.0);
        vec3 wall = vec3(0.16, 0.12, 0.10) * (0.7 + 0.5 * fbm2(vec2(atan(dir.x, dir.z) * 5.0, dir.y * 8.0)));
        col = wall * (0.35 + 0.6 * swell) * exp(-h * 3.0);
        // The lamp, high in the middle.
        col += vec3(1.0, 0.85, 0.6) * exp(-distance(dir, normalize(vec3(0.0, 0.75, 1.0))) * 4.0) * 0.12 * (0.5 + 0.5 * swell);
    }
    // Halos: each ringing fork throws rings across the wall behind it.
    for (int i = 0; i < 12; i++)
    {
        float ci = clamp(audioChroma[i] * 1.3, 0.0, 1.0);
        if (ci < 0.03) continue;
        vec3 d = normalize(vec3((float(i) - 5.5) * kSpacing, kGround + 8.0, kDist));
        float a = acos(clamp(dot(dir, d), -1.0, 1.0));
        float ring = pow(0.5 + 0.5 * cos(a * 42.0 - sceneTime * 5.0), 6.0);
        col += hsv2rgb(vec3(float(i) / 12.0, 0.6, 1.0)) * ring * exp(-a * 7.0) * ci * 0.55;
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
    int   idx   = int(vInst + 0.5);
    float speak = clamp(audioChroma[idx] * 1.3, 0.0, 1.0);

    vec4 base = texture(texMeshMaterial, vec3(vUV, 0.0));
    if (base.a < 0.1) discard;
    float roughness = 0.4, metallic = 0.5;
    if (texMeshMaterialLayers >= 2)
    {
        vec4 mr = texture(texMeshMaterial, vec3(vUV, 1.0));
        roughness = mr.g; metallic = mr.b;
    }
    vec3 n = normalize(vNormal);
    n = perturbNormal(texMeshMaterial, texMeshMaterialLayers, vUV, n, vPos, 1.0);
    vec3 viewDir = normalize(-vPos);
    vec3 alb = base.rgb * materialExposure(texMeshMaterial);

    vec3 lampDir = normalize(vec3(-0.3, 0.8, -0.5));
    vec3 col = alb * vec3(1.0, 0.88, 0.7) * max(dot(n, lampDir), 0.0) * (0.8 + 0.7 * swell);
    col += alb * vec3(0.20, 0.20, 0.28) * (0.55 + 0.45 * n.y) * 0.6;
    col += alb * 0.06;

    vec3 halfV = normalize(lampDir + viewDir);
    float spec = pow(max(dot(n, halfV), 0.0), mix(80.0, 8.0, roughness));
    col += mix(vec3(1.0, 0.95, 0.85), base.rgb, metallic) * spec * (0.4 + 0.6 * metallic);

    // The ring: the fork's own class colour, a standing wave along the tines.
    float tines = smoothstep(-0.1, 0.3, vLocal.y) * smoothstep(0.2, 0.6, metallic);
    float standing = 0.6 + 0.4 * cos(vLocal.y * 9.0 - time * 6.0);
    vec3 classCol = hsv2rgb(vec3(float(idx) / 12.0, 0.55, 1.0));
    col += classCol * tines * speak * (0.6 + 0.6 * standing);
    // The mallet on the loudest fork.
    float strike = (idx == loudest()) ? kick : 0.0;
    col += vec3(1.0, 0.95, 0.85) * tines * strike * 1.2;

    float fres = pow(1.0 - max(dot(n, viewDir), 0.0), 4.0);
    col += classCol * fres * speak * 0.5;

    if (hue > 0.001) col = hueRot(col, 0.08 * sin(hue));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.30 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
