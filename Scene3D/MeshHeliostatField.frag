#version 330 core
out vec4 fragColor;
/**
 * @file MeshHeliostatField.frag
 * @brief MESH HELIOSTAT FIELD: a real receiver tower (model=) in a field
 * of real heliostats (model2=, instanced), each aimed so the sun lands on
 * the receiver. The panels reflect the sky -- a true reflection, the sky
 * shell sampled along the mirrored view direction -- and track the sun as
 * it creeps on time. The receiver glows white-hot with the bass, the
 * treble runs glints across the field where a panel catches the sun, the
 * swell is the daylight and the haze of the beams. Desert noon. The mesh
 * counterpart of the procedural HeliostatSolarTower.
 *
 * Audio Reactivity:
 *   audioBass  -> receiver glow (light)
 *   audioHigh  -> panel glints (light)
 *   audioSwell -> daylight and beam haze (slow)
 *   time       -> the sun and the tracking (continuous, vertex stage)
 *
 * Per-instance: sizeP, mirrorP. Per-activation variety: hueP.
 */

uniform sampler2DArray texMeshMaterial;     // the tower
uniform int   texMeshMaterialLayers;
uniform sampler2DArray texMeshMaterial2;    // the heliostat
uniform int   texMeshMaterialLayers2;

uniform float time;
uniform float audioBass;
uniform float audioHigh;
uniform float audioSwell;

uniform float hueP;

in vec2  vUV;
in vec3  vNormal;
in vec3  vPos;
in vec3  vLocal;
in float vBg;
in float vMirror;
in vec3  vObjN;

const float kGround = -6.0;
const vec3  kTowerFoot = vec3(0.0, kGround, 170.0);
const float kTowerH = 70.0;

vec3 sunDir()
{
    float a = 0.4 + 0.10 * sin(time * 0.017);
    float e = 0.62 + 0.06 * sin(time * 0.011);
    return normalize(vec3(sin(a) * cos(e), sin(e), -cos(a) * cos(e)));
}

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

// The sky and the desert, also sampled by the mirrors.
vec3 renderSky(vec3 dir)
{
    float swell = clamp(audioSwell, 0.0, 1.0);
    float bass  = clamp(audioBass, 0.0, 1.0);
    float day = 0.85 + 0.25 * swell;
    vec3 sd = sunDir();
    vec3 col;
    if (dir.y < -0.004)
    {
        float t = kGround / dir.y;
        vec3 P = dir * t;
        float haze = exp(-t * 0.003);
        float g = fbm2(P.xz * 0.04), g2 = fbm2(P.xz * 0.35);
        col = mix(vec3(0.55, 0.45, 0.30), vec3(0.72, 0.62, 0.45), g) * (0.75 + 0.4 * g2) * day;
        col = mix(vec3(0.80, 0.78, 0.75) * day, col, haze);
    }
    else
    {
        float h = clamp(dir.y, 0.0, 1.0);
        col = mix(vec3(0.85, 0.85, 0.82), vec3(0.28, 0.50, 0.85), pow(h, 0.5)) * day;
        float sdist = distance(dir, sd);
        col += vec3(1.0, 0.95, 0.85) * exp(-sdist * 6.0) * 0.6;
        col += vec3(1.0) * (1.0 - smoothstep(0.03, 0.04, sdist)) * 3.0;
        float az = atan(dir.x, dir.z);
        float ridge = 0.015 + 0.03 * noise1(az * 3.0 + 4.0) + 0.01 * noise1(az * 12.0);
        float mtn = 1.0 - smoothstep(ridge - 0.004, ridge + 0.004, dir.y);
        col = mix(col, vec3(0.62, 0.60, 0.65) * day, mtn);
    }
    // The receiver's halo and the haze of the converging beams -- small:
    // at the first setting the halo was the picture and the tower a
    // silhouette inside it.
    vec3 recv = normalize(kTowerFoot + vec3(0.0, kTowerH * 0.82, 0.0));
    float a = 1.0 - dot(dir, recv);
    col += vec3(1.0, 0.95, 0.85) * exp(-a * 900.0) * (0.3 + 0.9 * bass);
    col += vec3(1.0, 0.9, 0.75) * exp(-a * 60.0) * (0.04 + 0.10 * swell);
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
    float high  = clamp(audioHigh, 0.0, 1.0);
    float day   = 0.85 + 0.25 * swell;
    bool mirror = vMirror > 0.5;

    vec4 base;
    float roughness = 0.7, metallic = 0.0;
    vec3 n = normalize(vNormal);
    float expose;
    if (mirror)
    {
        base = texture(texMeshMaterial2, vec3(vUV, 0.0));
        if (texMeshMaterialLayers2 >= 2)
        {
            vec4 mr = texture(texMeshMaterial2, vec3(vUV, 1.0));
            roughness = mr.g; metallic = mr.b;
        }
        expose = materialExposure(texMeshMaterial2);
    }
    else
    {
        base = texture(texMeshMaterial, vec3(vUV, 0.0));
        if (texMeshMaterialLayers >= 2)
        {
            vec4 mr = texture(texMeshMaterial, vec3(vUV, 1.0));
            roughness = mr.g; metallic = mr.b;
        }
        n = perturbNormal(texMeshMaterial, texMeshMaterialLayers, vUV, n, vPos, 1.0);
        expose = materialExposure(texMeshMaterial);
    }
    if (base.a < 0.1) discard;

    vec3 viewDir = normalize(-vPos);
    vec3 alb = base.rgb * expose;
    vec3 sd = sunDir();

    // Noon: hard sun, a bright sky fill, the sand's bounce. The tower's
    // concrete is dark in the texture and stood as a silhouette at first --
    // a generous fill is what a desert at noon looks like anyway.
    vec3 col = alb * vec3(1.0, 0.95, 0.85) * max(dot(n, sd), 0.0) * 1.6 * day;
    col += alb * vec3(0.55, 0.65, 0.90) * (0.55 + 0.45 * n.y) * 0.9 * day;
    col += alb * vec3(0.65, 0.55, 0.40) * max(-n.y, 0.0) * 0.6 * day;
    col += alb * 0.12;

    if (mirror)
    {
        // The glass: a real reflection of the sky along the mirrored view.
        // The panel is the model's +Z face (the generator's camera side), so
        // the mask is the object-space normal, not the material -- the
        // baked metallic map of a photographed panel says nothing reliable.
        float glass = smoothstep(0.6, 0.9, vObjN.z);
        vec3 r = reflect(-viewDir, n);
        vec3 refl = renderSky(r);
        float glint = pow(max(dot(r, sd), 0.0), 60.0);
        col = mix(col, refl * 0.9, glass * 0.85);
        col += vec3(1.0, 0.98, 0.9) * glint * glass * (0.8 + 3.0 * high);
    }
    else
    {
        // The receiver: the bright band near the top, white-hot with the bass.
        float luma = dot(base.rgb, vec3(0.299, 0.587, 0.114));
        float recv = smoothstep(0.45, 0.62, vLocal.y) * (1.0 - smoothstep(0.85, 0.95, vLocal.y)) * smoothstep(0.35, 0.6, luma);
        col += vec3(1.0, 0.95, 0.85) * recv * (0.8 + 2.2 * bass);
        col += vec3(1.0, 0.7, 0.4) * recv * 0.3;
    }

    vec3 halfV = normalize(sd + viewDir);
    float spec = pow(max(dot(n, halfV), 0.0), mix(60.0, 6.0, roughness));
    col += mix(vec3(1.0), base.rgb, metallic) * spec * 0.25 * day;

    if (hue > 0.001) col = hueRot(col, 0.08 * sin(hue));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.30 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
