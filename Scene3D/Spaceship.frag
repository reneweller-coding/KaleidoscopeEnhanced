#version 330 core
out vec4 fragColor;
/**
 * @file Spaceship.frag
 * @brief GEOM="MESH" SHOWCASE: a real loaded 3D model (config attribute
 * model=, see Source/MeshImport.h) tumbling through a real backdrop -- a
 * dust nebula + starfield painted onto the sky shell Scene3DShader::
 * buildGeometry() appends after the loaded mesh (see Spaceship.vert) --
 * vBg selects shell vs. hull. Lit from its own baked material plus a
 * shield-flicker rim; no photo-tinting on the hull itself, the nebula
 * carries the color.
 *   audioAdvance -> tumble speed
 *   audioKick    -> vertical bob (vertex stage) + shield-flicker flashes
 *   audioSwell   -> key light / rim glow intensity
 *
 * Per-activation variety:
 *   hueP float palette offset (0..6.28)
 */

uniform sampler2DArray texMeshMaterial;   // layer 0 = baseColor+opacity, layer 1 = (unused,roughness,metallic)
uniform int texMeshMaterialLayers;        // 1 = base color only, 2 = + metallic-roughness

uniform float time;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioSwell;

uniform float hueP;

in vec2 vUV;
in vec3 vNormal;
in vec3 vPos;
in float vBg;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

// ---- Sky shell: shared hash/noise/fbm + a dust nebula ----
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
    float n1 = fbm(dir * 2.1 + vec3(time * 0.004, 0.0, 0.0));
    float n2 = fbm(dir * 5.2 - vec3(0.0, time * 0.003, 0.0));
    vec3 tint = vec3(0.25, 0.18, 0.45);
    vec3 cloud = mix(tint * 0.15, tint * 1.3, smoothstep(0.35, 0.75, n1)) * (0.5 + 0.6 * n2);
    return cloud + vec3(1.0) * starsField(dir, 0.0018);
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
    if (vBg > 0.5)
    {
        fragColor = vec4(renderSky(normalize(vPos)), 1.0);
        return;
    }

    float hue = (hueP > 0.01 ? hueP : 0.0);

    vec4 base = texture(texMeshMaterial, vec3(vUV, 0.0));
    // This pass draws opaque/depth-tested (see Scene3DShader::draw()'s
    // GEOM_MESH branch) with GL_BLEND off, so a partial alpha can't fade --
    // treat the opacity map as a cutout mask instead (hull grating, thin
    // antenna mesh) rather than silently ignoring it.
    if (base.a < 0.1) discard;
    float roughness = 0.6, metallic = 0.1;
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

    // A single distant key light plus a soft fill, standing in for the
    // system's star -- there is no scene-wide light rig to hook into here,
    // every Scene3D scene fakes its own.
    vec3 lightDir = normalize(vec3(0.4, 0.6, -0.5));
    float diff = max(dot(n, lightDir), 0.0);
    float fill = 0.5 + 0.5 * dot(n, vec3(0.0, 1.0, 0.0));

    vec3 halfV = normalize(lightDir + viewDir);
    float spec = pow(max(dot(n, halfV), 0.0), mix(64.0, 4.0, roughness));
    vec3 specColor = mix(vec3(1.0), base.rgb, metallic);

    // The hull's own albedo is a very dark "gunmetal" (near-black by
    // design, see this ship's spec) -- measured directly against the
    // decoded texture, its lit contribution alone stays under ~0.15 even at
    // full diffuse. A generous ambient/fill floor is what makes the shape
    // and panel-line detail actually read as a ship instead of a silhouette.
    float expose = materialExposure(texMeshMaterial);
    vec3 col = base.rgb * expose * (0.55 + diff * (1.4 + 0.6 * audioSwell) + fill * 0.35);
    col += specColor * spec * (0.6 + 0.8 * (1.0 - roughness));

    // Rim glow + shield-flicker: a fixed cool tint, kept deliberately modest
    // -- an edge accent, not a wash across the whole hull. The nebula
    // outside now carries the color variety, not a photo-tinted hull.
    float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 4.0);
    col += vec3(0.55, 0.5, 0.85) * fresnel * (0.15 + 0.35 * audioSwell + 0.5 * audioKick);

    if (hue > 0.001) col = hueRot(col, 0.2 * sin(hue));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
