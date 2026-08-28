#version 330 core
out vec4 fragColor;
/**
 * @file Creature.frag
 * @brief GEOM="MESH" FAMILY: a sea creature (jellyfish, manta, humpback,
 * squid, seahorse, anglerfish) swimming in an open water column. The
 * swimming itself is vertex-stage deformation -- see Creature.vert, which
 * is where the four movement modes live. This stage lights it the way water
 * does: a hard sunlit top, a dim blue-green bounce from below, caustic
 * light webs crawling over the upward-facing surfaces, and enough
 * translucency at the silhouette that thin parts (a bell, a fin) glow
 * rather than going solid black.
 *   audioSwell   -> sunlight strength, caustic brightness
 *   audioKick    -> bioluminescent pulse along the body
 *   audioAdvance -> caustic drift, drift rotation (vertex stage)
 *
 * Per-instance: sizeP, deformP (movement mode, see Creature.vert),
 *               ampP/freqP (stroke depth and rate), glowP (biolume amount).
 * Per-activation variety: hueP float palette offset (0..6.28).
 */

uniform sampler2DArray texMeshMaterial;
uniform int texMeshMaterialLayers;

uniform float time;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioSwell;

uniform float hueP;
uniform float glowP;

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

// Caustics: two counter-drifting noise fields, each sharpened to a ridge by
// folding around 0.5. Where the two ridge sets cross you get the bright
// knots real caustics show, which a single field never produces.
float caustic(vec2 p, float t)
{
    float a = 1.0 - abs(noise3(vec3(p * 3.1, t * 0.25)) * 2.0 - 1.0);
    float b = 1.0 - abs(noise3(vec3(p * 4.7 + 31.7, t * 0.19)) * 2.0 - 1.0);
    return pow(a * b, 3.5);
}

// ---- Sky shell: the water column. Bright green-blue toward the surface
// overhead, falling off to near-black below; caustics only where you can
// actually see the surface, plus marine snow drifting through. ----
vec3 renderSky(vec3 dir)
{
    float up = dir.y;
    vec3 deep    = vec3(0.005, 0.020, 0.045);
    vec3 mid     = vec3(0.020, 0.090, 0.140);
    vec3 surface = vec3(0.14,  0.42,  0.46);
    vec3 col = mix(deep, mid, smoothstep(-0.7, 0.15, up));
    col = mix(col, surface, smoothstep(0.25, 0.95, up));

    if (up > 0.05)
    {
        // Project onto the surface plane overhead for true perspective --
        // the caustic cells stretch out toward the horizon exactly the way
        // they do when you look up underwater.
        float t = 1.0 / up;
        vec2 s = dir.xz * t;
        float c = caustic(s * 0.5, time + audioAdvance * 0.3);
        float fade = smoothstep(0.05, 0.5, up) * exp(-t * 0.05);
        col += vec3(0.55, 0.95, 0.85) * c * fade * (1.0 + 0.9 * audioSwell);

        // God rays: bright where the sight line is near-vertical, broken up
        // by the same drifting field so they flicker like real shafts.
        float shaft = pow(max(up, 0.0), 3.0) * (0.4 + 0.6 * noise3(vec3(s * 0.35, time * 0.08)));
        col += vec3(0.30, 0.60, 0.60) * shaft * 0.55 * (0.7 + 0.6 * audioSwell);
    }

    // Marine snow, always sinking.
    float snow = noise3(dir * 90.0 + vec3(0.0, time * 0.09, 0.0));
    col += vec3(0.5, 0.62, 0.6) * smoothstep(0.80, 0.94, snow) * 0.5;
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
    float gp  = (glowP > 0.01 ? glowP : 1.0);

    vec4 base = texture(texMeshMaterial, vec3(vUV, 0.0));
    if (base.a < 0.1) discard;
    float roughness = 0.45, metallic = 0.0;
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

    // Sun straight down through the water, cool bounce from the depths.
    vec3 sunDir = normalize(vec3(0.12, 1.0, -0.25));
    float diff = max(dot(n, sunDir), 0.0);
    float belowFill = max(-dot(n, sunDir), 0.0);

    vec3 halfV = normalize(sunDir + viewDir);
    float spec = pow(max(dot(n, halfV), 0.0), mix(70.0, 12.0, roughness));

    vec3 col = base.rgb * vec3(0.75, 0.95, 1.0) * (0.22 + diff * (1.35 + 0.5 * audioSwell));
    col += base.rgb * vec3(0.05, 0.22, 0.30) * belowFill * 0.5;
    col += vec3(0.8, 1.0, 1.0) * spec * (0.35 + 0.45 * (1.0 - roughness));

    // Caustic light crawling over the upward-facing surfaces. Driven from
    // WORLD xz so the pattern belongs to the water, not to the animal --
    // it should slide across the body as the creature swims through it.
    float upFace = max(n.y, 0.0);
    float c = caustic(vPos.xz * 0.055, time + audioAdvance * 0.3);
    col += vec3(0.45, 0.95, 0.8) * c * upFace * (0.55 + 0.7 * audioSwell);

    // Translucency: thin, edge-on parts (a bell rim, a fin) let the light
    // through instead of going solid. A fresnel term stands in for real
    // subsurface scattering, which would need thickness data the mesh has
    // no way to carry.
    float rim = pow(1.0 - max(dot(n, viewDir), 0.0), 2.5);
    col += vec3(0.35, 0.85, 0.85) * rim * (0.25 + 0.35 * audioSwell);

    // Bioluminescence: a pulse travelling down the body on the beat.
    float travel = fract(vLocalPos.y * 1.4 - time * 0.35 - audioAdvance * 0.2);
    float band = smoothstep(0.0, 0.05, travel) * (1.0 - smoothstep(0.05, 0.16, travel));
    col += vec3(0.25, 0.95, 1.0) * band * gp * (0.35 + 1.5 * audioKick);

    if (hue > 0.001) col = hueRot(col, 0.2 * sin(hue));

    // Water absorbs red first, so distance shifts everything blue-green --
    // a plain fade to black would look like fog in air instead.
    float dist = length(vPos);
    float depth = clamp((dist - 80.0) / 130.0, 0.0, 1.0);
    col = mix(col, vec3(0.02, 0.09, 0.13), depth);

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
