#version 330 core
out vec4 fragColor;
/**
 * @file AtmosphericEntry.frag
 * @brief GEOM="MESH" FAMILY: a ship commits to a descent and burns its way
 * into a planet's atmosphere. Staged on `sceneProgress` (see the .vert): a
 * beat of vacuum, then the planet swelling to fill the frame while the hull
 * heats from the leading edges back and drags an ionised wake.
 *
 * The planet lives on the SKY SHELL, not as geometry. Its apparent size is
 * driven by growing the angular radius the shell tests against, which is
 * what approaching actually looks like -- and it sidesteps having to model a
 * body whose real scale would swamp the depth range for the sake of the one
 * arc that is ever on screen. The atmosphere is a rim term on that disc, so
 * the limb glows and the terminator stays soft.
 *   sceneProgress -> descent, planet size, heating, wake (mostly vertex stage)
 *   audioKick     -> airframe judder + plasma flare
 *   audioSwell    -> daylight side brightness
 *
 * Per-instance: sizeP, shakeP (judder), tintP (planet hue), atmoP (how thick
 *               the atmosphere reads).
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
uniform float tintP;
uniform float atmoP;

in vec2  vUV;
in vec3  vNormal;
in vec3  vPos;
in vec3  vLocalPos;
in float vBg;
in float vEntry;

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

const vec3 kSunDir = vec3(0.55, 0.42, -0.72);

vec3 renderSky(vec3 dir, vec3 tint)
{
    // The planet sits below and ahead; its angular radius grows with the
    // descent, which is what "approaching" looks like from inside the shot.
    vec3 pDir = normalize(vec3(0.10, -0.62, 0.78));
    float cosR = mix(0.86, 0.02, smoothstep(0.0, 1.0, sceneProgress));
    float d = dot(dir, pDir);

    vec3 col = vec3(0.006, 0.008, 0.014) + vec3(1.0) * starsField(dir, 0.0016);

    float atmo = (atmoP > 0.01 ? atmoP : 1.0);
    // Atmospheric limb: a band just OUTSIDE the disc, brightest where the
    // sun grazes it. This is what makes a flat disc read as a world with air
    // around it rather than a painted circle.
    float limb = smoothstep(cosR - 0.10 * atmo, cosR, d) * (1.0 - smoothstep(cosR, cosR + 0.012, d));
    float sunFace = max(dot(pDir, normalize(kSunDir)), 0.0);
    col += tint * limb * (1.4 + 1.2 * sunFace) * (0.7 + 0.5 * audioSwell);

    if (d > cosR)
    {
        // Surface. Build a local frame on the disc so the terrain and cloud
        // bands don't smear as the apparent size changes.
        vec3 up = (abs(pDir.y) < 0.99) ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
        vec3 rt = normalize(cross(up, pDir));
        vec3 uv3 = normalize(dir - pDir * d);
        vec2 s = vec2(dot(uv3, rt), dot(uv3, cross(pDir, rt)));
        float r = sqrt(max(0.0, 1.0 - (1.0 - d) / max(1.0 - cosR, 1e-4)));   // 1 at the centre, 0 at the limb

        vec2 q = s * 3.2;
        float land = fbm(vec3(q, 2.7));
        float band = fbm(vec3(q * vec2(0.6, 2.4), 8.3));          // stretched = cloud bands
        vec3 sea  = tint * vec3(0.35, 0.55, 1.0) * 0.55;
        vec3 soil = tint * vec3(1.0, 0.75, 0.45) * 0.6;
        vec3 surf = mix(sea, soil, smoothstep(0.45, 0.62, land));
        surf = mix(surf, vec3(0.95, 0.96, 1.0), smoothstep(0.55, 0.78, band) * 0.75);

        // Day/night across the disc, with a soft terminator.
        float lam = clamp(dot(normalize(dir), normalize(kSunDir)) * 0.5 + 0.62, 0.0, 1.0);
        surf *= 0.10 + 1.25 * smoothstep(0.15, 0.85, lam) * (0.8 + 0.4 * audioSwell);
        // Haze thickens toward the limb, where the sight line runs longest
        // through the air.
        surf = mix(surf, tint * 1.1, (1.0 - r) * 0.45 * atmo);
        col = mix(col, surf, smoothstep(cosR, cosR + 0.004, d));
    }
    return col;
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
    vec3 tint = hsv2rgb(vec3(tintP / 6.2831853, 0.45, 1.0));

    if (vBg > 0.5)
    {
        fragColor = vec4(renderSky(normalize(vPos), tint), 1.0);
        return;
    }

    float hue = (hueP > 0.01 ? hueP : 0.0);

    vec4 base = texture(texMeshMaterial, vec3(vUV, 0.0));
    if (base.a < 0.1) discard;
    float roughness = 0.55, metallic = 0.3;
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

    vec3 lightDir = normalize(kSunDir);
    float diff = max(dot(n, lightDir), 0.0);
    float fill = 0.5 + 0.5 * dot(n, vec3(0.0, 1.0, 0.0));
    vec3 halfV = normalize(lightDir + viewDir);
    float spec = pow(max(dot(n, halfV), 0.0), mix(50.0, 8.0, roughness));

    float expose = materialExposure(texMeshMaterial);
    vec3 col = base.rgb * expose * (0.35 + diff * (1.2 + 0.4 * audioSwell) + fill * 0.25);
    col += mix(vec3(1.0), base.rgb, metallic) * spec * (0.45 + 0.5 * (1.0 - roughness));
    // Bounce light off the planet below, which grows as it fills the view.
    col += base.rgb * tint * max(-n.y, 0.0) * 0.55 * vEntry;

    // HEATING. Hottest where the surface faces into the airflow -- the ship
    // travels roughly -Y/+X here, so that direction is the stagnation side.
    // Using the real normal rather than a fixed part of the model means the
    // glow follows the attitude as it pitches and rolls, instead of being
    // painted on one end of the hull.
    vec3 flow = normalize(vec3(0.42, -0.86, 0.28));
    float facing = max(dot(n, flow), 0.0);
    float heat = pow(facing, 1.6) * vEntry;
    float flicker = 0.85 + 0.35 * fbm(vec3(vLocalPos.xy * 9.0, time * 3.5));
    // Metal heat ramp: dull red -> orange -> yellow-white as it builds.
    vec3 hot = mix(vec3(0.9, 0.12, 0.02), vec3(1.0, 0.55, 0.12), smoothstep(0.2, 0.6, heat));
    hot = mix(hot, vec3(1.0, 0.95, 0.75), smoothstep(0.62, 1.0, heat));
    col += hot * heat * flicker * (1.3 + 1.1 * audioKick);

    // Ionised sheath standing off the leading edges, strongest at the limb
    // of the silhouette.
    float fres = pow(1.0 - max(dot(n, viewDir), 0.0), 2.6);
    col += mix(vec3(1.0, 0.45, 0.15), vec3(0.6, 0.85, 1.0), 0.25)
         * fres * vEntry * (1.1 + 0.9 * audioKick);

    // Trailing wake off the aft end, only once it is actually burning.
    float aft = smoothstep(-0.18, -0.48, vLocalPos.z);
    col += vec3(1.0, 0.6, 0.25) * aft * vEntry * (0.7 + 1.0 * audioKick);

    if (hue > 0.001) col = hueRot(col, 0.12 * sin(hue));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
