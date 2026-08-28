#version 330 core
out vec4 fragColor;
/**
 * @file ShatterSculpture.frag
 * @brief GEOM="MESH" FAMILY: a museum piece (marble bust, gargoyle, bronze
 * dancer, terracotta warrior, stone lion) lit like a gallery at night, which
 * bursts into its own triangles with the music and reassembles. The shatter
 * itself is done in ShatterSculpture.geom -- see that file for why it needs
 * the geometry stage. This stage shades the result and lights the fracture:
 * vShard says how far a given shard has flown, and the further out it is the
 * more it glows from inside, as if the stone were only a shell over
 * something molten.
 *   audioAdvance -> burst cycle (geometry stage)
 *   audioKick    -> extra burst + fracture flash
 *   audioSwell   -> spotlight strength
 *
 * Per-instance: sizeP (relative scale), burstP (how far it flies),
 *               spinP (shard tumble rate).
 * Per-activation variety: hueP float palette offset (0..6.28).
 */

uniform sampler2DArray texMeshMaterial;
uniform int texMeshMaterialLayers;

uniform float time;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioSwell;

uniform float hueP;

in vec2  vUV;
in vec3  vNormal;
in vec3  vPos;
in float vBg;
in float vShard;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
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

// ---- Sky shell: a darkened gallery. Not a starfield -- this piece is
// indoors, and the room should read as an enclosing space, so the backdrop
// is a soft warm pool low down (the plinth lighting bouncing off the floor)
// falling away to near-black overhead, with dust drifting in the beam. ----
vec3 renderSky(vec3 dir)
{
    float h = dir.y * 0.5 + 0.5;
    vec3 col = mix(vec3(0.055, 0.045, 0.038), vec3(0.006, 0.006, 0.010), smoothstep(0.35, 0.95, h));
    // The warm pool sits behind and below the piece.
    float pool = pow(max(1.0 - abs(dir.y + 0.18) * 3.4, 0.0), 2.0);
    col += vec3(0.16, 0.11, 0.07) * pool * (0.6 + 0.5 * audioSwell);
    // Dust motes, drifting slowly upward through the light.
    float dust = noise3(dir * 60.0 + vec3(0.0, -time * 0.06, 0.0));
    col += vec3(0.35, 0.30, 0.24) * smoothstep(0.72, 0.9, dust) * pool * 0.7;
    return col;
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
    if (base.a < 0.1) discard;
    float roughness = 0.7, metallic = 0.1;
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

    // Gallery spotlight: one hard warm key from high front-left, a very dim
    // cool fill so the shadow side is readable rather than black.
    vec3 keyDir = normalize(vec3(-0.45, 0.75, -0.5));
    float key = max(dot(n, keyDir), 0.0);
    float fill = 0.5 + 0.5 * dot(n, vec3(0.3, -0.4, -0.6));

    vec3 halfV = normalize(keyDir + viewDir);
    float spec = pow(max(dot(n, halfV), 0.0), mix(60.0, 10.0, roughness));
    vec3 specColor = mix(vec3(1.0, 0.96, 0.9), base.rgb, metallic);

    vec3 col = base.rgb * vec3(1.0, 0.96, 0.9) * (0.30 + key * (1.5 + 0.5 * audioSwell));
    col += base.rgb * vec3(0.35, 0.42, 0.6) * fill * 0.22;
    col += specColor * spec * (0.5 + 0.7 * (1.0 - roughness));

    // The fracture glow: the further a shard has travelled, the more it is
    // lit from within. Backfaces (the freshly exposed inner surface of the
    // stone) take the most of it, which is what sells the break -- the
    // outside stays stone, the inside is molten.
    if (vShard > 0.001)
    {
        float inner = gl_FrontFacing ? 0.35 : 1.0;
        vec3 core = mix(vec3(1.0, 0.42, 0.12), vec3(1.0, 0.85, 0.45), audioKick);
        col += core * vShard * inner * (0.55 + 1.1 * audioKick);
        // Cool the stone slightly as it flies, so shards read as separate
        // objects against the warm-lit body still standing.
        col = mix(col, col * vec3(0.85, 0.9, 1.05), vShard * 0.4);
    }

    float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 4.0);
    col += vec3(0.9, 0.85, 0.75) * fresnel * (0.10 + 0.18 * audioSwell);

    if (hue > 0.001) col = hueRot(col, 0.15 * sin(hue));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
