#version 330 core
out vec4 fragColor;
/**
 * @file MeshTermiteMound.frag
 * @brief MESH TERMITE MOUND: a real cathedral mound (model=) on the savanna
 * at dusk, and the heat it breathes out -- columns of warm haze rising
 * from its chimneys into the evening sky on the scene clock, their
 * strength the bass (the mound's warmth), their fine flicker the treble,
 * the dusk light the swell. Acacias on the horizon, the first stars. The
 * mesh counterpart of the procedural TermiteMoundPlumes (whose refracting
 * plumes have no place to refract here: the haze is painted light).
 *
 * Audio Reactivity:
 *   audioBass  -> plume strength and the chimney warmth (light)
 *   audioHigh  -> fine shimmer in the haze (light)
 *   audioSwell -> dusk light (slow)
 *   sceneTime  -> the plumes rise (continuous)
 *
 * Per-instance: sizeP, yawP. Per-activation variety: hueP.
 */

uniform sampler2DArray texMeshMaterial;
uniform int   texMeshMaterialLayers;

uniform float time;
uniform float sceneTime;
uniform float audioBass;
uniform float audioHigh;
uniform float audioSwell;

uniform float hueP;

in vec2  vUV;
in vec3  vNormal;
in vec3  vPos;
in vec3  vLocal;
in float vBg;

const float kDist   = 62.0;
const float kGround = -22.0;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
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
vec3 stars(vec3 v)
{
    vec2 sph = vec2(atan(v.z, v.x) / 6.2831853 + 0.5, acos(clamp(v.y, -1.0, 1.0)) / 3.14159);
    vec2 g = sph * vec2(180.0, 90.0);
    vec2 id = floor(g);
    vec2 f = fract(g) - 0.5;
    float h = hash21(id);
    vec2 jit = vec2(hash21(id + 1.3), hash21(id + 7.9)) - 0.5;
    float d = length(f - jit * 0.8);
    return vec3(0.85, 0.88, 1.0) * step(0.93, h) * pow(1.0 - clamp(d * 3.2, 0.0, 1.0), 4.0) * 0.7;
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

const vec3 kKeyDir = vec3(0.6, 0.30, -0.65);   // the last sun, low, behind the camera's right

vec3 renderSky(vec3 dir)
{
    float swell = clamp(audioSwell, 0.0, 1.0);
    float bass  = clamp(audioBass, 0.0, 1.0);
    float high  = clamp(audioHigh, 0.0, 1.0);
    float dusk = 0.6 + 0.5 * swell;
    vec3 col;
    if (dir.y < -0.004)
    {
        float t = kGround / dir.y;
        vec3 P = dir * t;
        float haze = exp(-t * 0.005);
        float g = fbm2(P.xz * 0.06), g2 = fbm2(P.xz * 0.5);
        vec3 grass = mix(vec3(0.30, 0.22, 0.08), vec3(0.45, 0.36, 0.14), g) * (0.7 + 0.5 * g2);
        col = grass * dusk * 0.7;
        col = mix(vec3(0.40, 0.22, 0.20) * dusk, col, haze);
    }
    else
    {
        float h = clamp(dir.y, 0.0, 1.0);
        col = mix(vec3(0.95, 0.50, 0.22), vec3(0.12, 0.08, 0.28), pow(h, 0.5)) * dusk;
        // Acacias on the horizon: flat crowns on thin trunks, as silhouettes.
        float az = atan(dir.x, dir.z);
        float crown = 0.035 + 0.045 * smoothstep(0.55, 0.75, noise1(az * 6.0 + 2.0)) * (0.7 + 0.3 * noise1(az * 40.0));
        float treeMask = 1.0 - smoothstep(crown - 0.005, crown + 0.005, dir.y);
        col = mix(col, vec3(0.03, 0.025, 0.02), treeMask);
        col += stars(dir) * smoothstep(0.12, 0.5, h) * (1.2 - 0.6 * swell);

        // The heat plumes: warm haze rising above the mound's chimneys in
        // the direction of the mound top, spreading as it climbs.
        float top = atan(kGround + 40.0, kDist);          // elevation of the mound top
        float rise = (dir.y - top * 0.85) / 0.45;         // 0 at the chimneys, 1 well above
        float lean = 0.05 * rise * rise;                   // the evening breeze
        float w = 0.10 + 0.22 * rise;
        float column = exp(-pow((az - lean) / w, 2.0)) * smoothstep(-0.05, 0.15, rise) * (1.0 - smoothstep(0.6, 1.3, rise));
        float hz = fbm2(vec2(az * 9.0, dir.y * 7.0 - sceneTime * 0.18));
        float fine = noise2(vec2(az * 60.0, dir.y * 40.0 - sceneTime * 1.2));
        float plume = column * smoothstep(0.35, 0.7, hz + 0.15 * fine * high) * (0.25 + 0.75 * bass);
        col += vec3(1.0, 0.55, 0.25) * plume * 0.55;
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
    float bass  = clamp(audioBass, 0.0, 1.0);
    float dusk  = 0.6 + 0.5 * swell;

    vec4 base = texture(texMeshMaterial, vec3(vUV, 0.0));
    if (base.a < 0.1) discard;
    float roughness = 0.9, metallic = 0.0;
    if (texMeshMaterialLayers >= 2)
    {
        vec4 mr = texture(texMeshMaterial, vec3(vUV, 1.0));
        roughness = mr.g; metallic = mr.b;
    }
    vec3 n = normalize(vNormal);
    n = perturbNormal(texMeshMaterial, texMeshMaterialLayers, vUV, n, vPos, 1.0);
    vec3 viewDir = normalize(-vPos);
    vec3 alb = base.rgb * materialExposure(texMeshMaterial);

    vec3 keyDir = normalize(kKeyDir);
    vec3 col = alb * vec3(1.0, 0.65, 0.40) * max(dot(n, keyDir), 0.0) * 1.4 * dusk;
    col += alb * vec3(0.30, 0.22, 0.45) * (0.55 + 0.45 * n.y) * 0.45 * dusk;
    col += alb * vec3(0.30, 0.20, 0.08) * max(-n.y, 0.0) * 0.4 * dusk;
    col += alb * 0.05;

    // The mound's warmth: the chimney tops glow faintly from inside with the bass.
    float chimney = smoothstep(0.45, 0.9, vLocal.y);
    col += vec3(1.0, 0.45, 0.18) * chimney * (0.05 + 0.45 * bass) * (0.6 + 0.4 * max(n.y, 0.0));

    float fres = pow(1.0 - max(dot(n, viewDir), 0.0), 4.0);
    col += vec3(1.0, 0.6, 0.35) * fres * 0.2 * dusk;

    if (hue > 0.001) col = hueRot(col, 0.10 * sin(hue));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.30 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
