#version 330 core
out vec4 fragColor;
/**
 * @file ShipFlyby.frag
 * @brief GEOM="MESH" FAMILY: a capital ship makes one slow, majestic pass
 * across the frame -- entering off one side, coming close enough at mid-pass
 * that a large one no longer fits on screen, and leaving off the other. The
 * pass is staged on `sceneProgress`, so it always fills exactly the screen
 * time the scheduler gave the scene; see ShipFlyby.vert for the path.
 *
 * bgTypeP picks what it passes IN FRONT OF, which changes the whole read of
 * the shot: a nebula (lit hull against colour), or a huge star right behind
 * the flight path, which throws the hull into near-silhouette with light
 * spilling around its edges as it crosses.
 *   audioSwell   -> key light, engine glow, nebula brightness
 *   audioKick    -> engine flare + a small hull jolt (vertex stage)
 *
 * Per-instance: sizeP (>1 overflows the frame), travelP, approachP, bankP,
 *               bgTypeP (0 = nebula, 1 = backlit star), tintP (nebula hue).
 * Per-activation variety: hueP float palette offset (0..6.28).
 */

uniform sampler2DArray texMeshMaterial;
uniform int texMeshMaterialLayers;

uniform float time;
uniform float sceneProgress;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioSwell;

uniform float hueP;
uniform float bgTypeP;
uniform float tintP;

in vec2  vUV;
in vec3  vNormal;
in vec3  vPos;
in vec3  vLocalPos;
in float vBg;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}
vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}
float hash13(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise3(vec3 x) {
    vec3 i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    float n000 = hash13(i + vec3(0.0,0.0,0.0)), n100 = hash13(i + vec3(1.0,0.0,0.0));
    float n010 = hash13(i + vec3(0.0,1.0,0.0)), n110 = hash13(i + vec3(1.0,1.0,0.0));
    float n001 = hash13(i + vec3(0.0,0.0,1.0)), n101 = hash13(i + vec3(1.0,0.0,1.0));
    float n011 = hash13(i + vec3(0.0,1.0,1.0)), n111 = hash13(i + vec3(1.0,1.0,1.0));
    return mix(mix(mix(n000,n100,f.x), mix(n010,n110,f.x), f.y),
               mix(mix(n001,n101,f.x), mix(n011,n111,f.x), f.y), f.z);
}
float fbm(vec3 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise3(p); p = p * 2.03 + 7.1; a *= 0.5; }
    return v;
}
float starsField(vec3 dir, float density) {
    return smoothstep(1.0 - density, 1.0, hash13(floor(dir * 500.0)));
}

// The star sits BEHIND the flight path (+Z), so the ship crosses it.
const vec3 kStarDir = vec3(0.06, -0.05, 1.0);

vec3 renderSky(vec3 dir, vec3 tint)
{
    if (bgTypeP < 0.5)
    {
        float n1 = fbm(dir * 2.2 + vec3(time * 0.004, 0.0, 0.0));
        float n2 = fbm(dir * 5.4 - vec3(0.0, time * 0.003, 0.0));
        // The beat lives HERE now. The hulls hold still (their kick hops and
    // the camera's swell-dolly are gone), so the backgrounds carry the
    // music: a kick pulse on the dominant glow, sized to read clearly
    // without breaking the temporal budget's full-frame brightness cap.
    vec3 cloud = mix(tint * 0.10, tint * 1.25, smoothstep(0.35, 0.78, n1)) * (0.5 + 0.6 * n2)
               * (0.82 + 0.30 * audioKick);
        return cloud + vec3(1.0) * starsField(dir, 0.0018);
    }
    // Backlit: a hard disc with a wide corona, bright enough that the hull
    // in front of it goes to near-silhouette.
    vec3 s = normalize(kStarDir);
    float d = max(dot(dir, s), 0.0);
    vec3 col = vec3(0.012, 0.012, 0.02);
    col += tint * pow(d, 1400.0) * 14.0;                       // the disc
    col += tint * pow(d, 22.0) * 0.85 * (0.6 + 0.5 * audioSwell + 0.35 * audioKick); // corona
    col += tint * pow(d, 3.0) * 0.12;                          // far bloom
    return col + vec3(1.0) * starsField(dir, 0.0012) * (1.0 - d);
}

// AUTO-EXPOSURE against the material's own average brightness.
// This asset set is not uniform: measured base-colour luma runs from 0.14
// (dark station hulls) to 0.67 (a near-white Culture GSV) -- a factor of
// more than four. A single fixed lighting gain therefore cannot serve both;
// tuned for the dark hulls it blows the bright ones out to a featureless
// white blob, which is exactly how they were rendering.
// The COARSEST MIP of the material array is the texture's average, so one
// extra fetch buys a per-model exposure with no CPU side and no new uniform.
float materialExposure(sampler2DArray tex)
{
    vec3 avg = textureLod(tex, vec3(0.5, 0.5, 0.0), 20.0).rgb;   // lod clamps to the last level
    float l = dot(avg, vec3(0.299, 0.587, 0.114));
    return clamp(0.20 / max(l, 0.02), 0.30, 2.0);
}

// ---- normal mapping ------------------------------------------------------
// Layer 2 of the material array is a tangent-space normal map, present on the
// assets whose generator run produced a usable one (about a fifth of them).
//
// There are no tangents in the vertex format -- it is a fixed 8 floats shared
// by every geom kind -- so the frame is rebuilt per fragment from screen-space
// derivatives of position and UV. That is the standard cotangent-frame trick,
// and it costs nothing in the vertex stage and no change to the buffer layout.
// A model WITHOUT a normal map has materialLayers < 3 and this returns the
// interpolated normal untouched, so every scene works either way.
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
    // A degenerate tap (an all-black texel from a failed decode) would
    // normalize to garbage and pit the whole surface.
    if (dot(m, m) < 1e-4) return n;
    m.xy *= strength;
    return normalize(cotangentFrame(n, wpos, uv) * normalize(m));
}

void main()
{
    vec3 tint = hsv2rgb(vec3(tintP / 6.2831853, (bgTypeP < 0.5 ? 0.55 : 0.28), 1.0));

    if (vBg > 0.5)
    {
        fragColor = vec4(renderSky(normalize(vPos), tint), 1.0);
        return;
    }

    float hue = (hueP > 0.01 ? hueP : 0.0);

    vec4 base = texture(texMeshMaterial, vec3(vUV, 0.0));
    if (base.a < 0.1) discard;
    float roughness = 0.55, metallic = 0.35;
    if (texMeshMaterialLayers >= 2)
    {
        vec4 mr = texture(texMeshMaterial, vec3(vUV, 1.0));
        roughness = mr.g;
        metallic  = mr.b;
    }

    vec3 n = normalize(vNormal);
    // Relief from the material's normal map, where the asset has one.
    n = perturbNormal(texMeshMaterial, texMeshMaterialLayers, vUV, n, vPos, 1.0);
    vec3 viewDir = normalize(-vPos);

    // With a star behind the flight path the key has to come from there too,
    // or the shot contradicts itself: a bright source in frame lighting the
    // hull from the front reads instantly as wrong.
    vec3 lightDir = (bgTypeP < 0.5) ? normalize(vec3(0.45, 0.55, -0.5))
                                    : normalize(kStarDir);
    float diff = max(dot(n, lightDir), 0.0);
    float fill = 0.5 + 0.5 * dot(n, vec3(0.0, 1.0, 0.0));

    vec3 halfV = normalize(lightDir + viewDir);
    float spec = pow(max(dot(n, halfV), 0.0), mix(52.0, 8.0, roughness));
    vec3 specColor = mix(vec3(0.95, 0.97, 1.0), base.rgb, metallic);

    float expose = materialExposure(texMeshMaterial);
    vec3 col;
    if (bgTypeP < 0.5)
    {
        col = base.rgb * expose * (0.45 + diff * (1.3 + 0.5 * audioSwell) + fill * 0.3);
        col += specColor * spec * (0.5 + 0.6 * (1.0 - roughness));
    }
    else
    {
        // Silhouette: almost no front fill, and a hot wrap where the star
        // grazes the hull's edge.
        col = base.rgb * expose * (0.10 + diff * 0.35 + fill * 0.10);
        float wrap = pow(1.0 - max(dot(n, viewDir), 0.0), 2.0) * max(dot(normalize(kStarDir), viewDir), 0.0);
        col += tint * wrap * (1.6 + 0.9 * audioSwell);
        col += specColor * spec * 0.35;
    }

    // Engine glow: the hull's own aft end (the model's nose is +Z, so the
    // engines are at the -Z end of object space), pushed by the beat.
    float aft = smoothstep(-0.22, -0.48, vLocalPos.z);
    vec3 engine = mix(vec3(0.35, 0.75, 1.0), vec3(1.0, 0.85, 0.55), 0.35);
    col += engine * aft * (0.45 + 0.9 * audioKick + 0.3 * audioSwell);

    // Running lights along the hull, blinking slowly out of step.
    float strip = step(0.955, fract(vLocalPos.z * 9.0 + vLocalPos.y * 3.0));
    float blink = 0.5 + 0.5 * sin(time * 2.4 + vLocalPos.z * 12.0);
    col += vec3(1.0, 0.35, 0.30) * strip * blink * 0.8;

    // Rim, so the hull separates from the backdrop even in silhouette.
    float fres = pow(1.0 - max(dot(n, viewDir), 0.0), 4.0);
    col += mix(vec3(0.7, 0.85, 1.0), tint, 0.4) * fres * (0.15 + 0.25 * audioSwell);

    if (hue > 0.001) col = hueRot(col, 0.15 * sin(hue));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
