#version 330 core
out vec4 fragColor;
/**
 * @file HubStation.frag
 * @brief GEOM="MESH" STATION FAMILY: civilian/trade hubs (cargo docks,
 * merchanter outposts, shipyards, quarantine posts, trade promenades),
 * shown against a busy starfield (with faint distant nebula wisps) painted
 * onto the sky shell Scene3DShader::buildGeometry() appends after the
 * loaded mesh (see HubStation.vert) -- vBg selects shell vs. hull. Warm,
 * brighter key light plus busy amber docking-light speckle across the
 * hull's darker baked patches -- a hub that's alive with traffic, not a
 * single glow but many small ones; no photo-tinting on the hull itself.
 *   audioSwell   -> key-light strength, docking-light brightness
 *   audioKick    -> docking-light twinkle
 *   audioAdvance -> tumble speed (vertex stage)
 *
 * Per-instance: sizeP (relative scale), busyP (docking-light density).
 * Per-activation variety: hueP float palette offset (0..6.28).
 */

uniform sampler2DArray texMeshMaterial;
uniform int texMeshMaterialLayers;

uniform float time;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioSwell;

uniform float hueP;
uniform float busyP;

in vec2 vUV;
in vec3 vNormal;
in vec3 vPos;
in float vBg;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

// Cheap per-cell hash for the docking-light speckle -- a fixed grid in UV
// space, not tied to any particular mesh's UV layout details.
float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 78.233);
    return fract(p.x * p.y);
}

// ---- Sky shell: shared hash/noise/fbm + a busy starfield ----
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
    float h = hash13(floor(dir * 500.0));
    return smoothstep(1.0 - density, 1.0, h);
}
vec3 renderSky(vec3 dir)
{
    // A busy starfield with faint warm nebula wisps -- open space near a
    // populated hub, not deep uninhabited void.
    float wisp = fbm(dir * 2.0 + vec3(time * 0.003, 0.0, 0.0));
    // The wisps were gated so tightly that most of the sky stayed at zero.
    // A populated hub should sit in visibly lit space, so there is now a
    // floor under them rather than pure black between.
    vec3 col = vec3(0.030, 0.026, 0.034)
             + vec3(0.20, 0.14, 0.09) * smoothstep(0.28, 0.70, wisp);
    return col + vec3(1.0, 0.97, 0.9) * starsField(dir, 0.0022);
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
    if (vBg > 0.5)
    {
        fragColor = vec4(renderSky(normalize(vPos)), 1.0);
        return;
    }

    float hue = (hueP > 0.01 ? hueP : 0.0);
    float bp  = (busyP > 0.01 ? busyP : 1.0);

    vec4 base = texture(texMeshMaterial, vec3(vUV, 0.0));
    if (base.a < 0.1) discard;
    float roughness = 0.6, metallic = 0.25;
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

    vec3 lightDir = normalize(vec3(0.4, 0.6, -0.5));
    float diff = max(dot(n, lightDir), 0.0);
    float fill = 0.55 + 0.45 * dot(n, vec3(0.0, 1.0, 0.0));

    vec3 halfV = normalize(lightDir + viewDir);
    float spec = pow(max(dot(n, halfV), 0.0), mix(40.0, 6.0, roughness));
    vec3 specColor = mix(vec3(1.0, 0.95, 0.85), base.rgb, metallic);

    // Brighter overall than the other families -- this is a lit,
    // populated hub, not deep infrastructure or a warship.
    vec3 col = base.rgb * (0.6 + diff * (1.3 + 0.4 * audioSwell) + fill * 0.4);
    col += specColor * spec * (0.5 + 0.55 * (1.0 - roughness));

    // Docking-light speckle: many small twinkling points across a coarse UV
    // grid, gated to the hull's darker patches (structure/shadow, not the
    // bright hazard-marking patches RingStation's window-glow already
    // covers for that use). Each cell gets its own on/off + twinkle phase.
    // step()'s threshold is 1-density, so at busyP=1.4 a naive 0.35 factor
    // would light ~49% of all cells at once -- read as a uniform wash
    // instead of scattered points (found by rendering). 0.12 keeps even the
    // busiest instance under ~17%.
    float lumaCell = dot(base.rgb, vec3(0.299, 0.587, 0.114));
    vec2 grid = vUV * 40.0;
    vec2 cell = floor(grid);
    float r = hash21(cell);
    float lit = step(1.0 - 0.12 * bp, r);
    float twinkle = 0.5 + 0.5 * sin(time * (2.0 + r * 6.0) + r * 30.0);
    float darkMask = 1.0 - smoothstep(0.15, 0.45, lumaCell);
    // Fixed warm amber -- the starfield outside now carries the color
    // variety, not a photo-tinted hull.
    col += vec3(1.0, 0.75, 0.4) * lit * darkMask * twinkle * (0.5 + 0.4 * audioSwell + 0.4 * audioKick);

    float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 4.0);
    col += vec3(1.0, 0.8, 0.5) * fresnel * (0.08 + 0.15 * audioSwell);

    if (hue > 0.001) col = hueRot(col, 0.15 * sin(hue));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
