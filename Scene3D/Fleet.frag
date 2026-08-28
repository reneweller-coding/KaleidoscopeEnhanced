#version 330 core
out vec4 fragColor;

/**
 * @file Fleet.frag
 * @brief A formation of one craft drawn many times (the placement is in the
 * vertex stage, via instances="N" and gl_InstanceID). The subject is the ORDER,
 * not the ship: the formation tightens on the beat, breathes between, and a
 * drop blows it apart.
 *
 * Shading is deliberately simple and mostly the same for every craft. Detail
 * per ship would be wasted -- at formation scale each is a few dozen pixels --
 * and worse, it would compete with the pattern. What DOES vary per craft is a
 * running light whose colour walks along the formation, because a travelling
 * signal is what makes a hundred identical objects read as a fleet under one
 * command rather than as a swarm.
 *
 *   audioKick  -> the formation tightens; engines flare
 *   audioDrop  -> the formation scatters (vertex stage)
 *   audioSwell -> engine glow
 *   audioAdvance -> the running light travels
 *
 * Per-instance: sizeP, formP (0 wedge / 1 column / 2 shell), spreadP, tintP.
 * Per-activation variety: hueP float palette offset (0..6.28).
 */

uniform sampler2DArray texMeshMaterial;
uniform int texMeshMaterialLayers;

uniform float time;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioSwell;

uniform float hueP;
uniform float tintP;

in vec2  vUV;
in vec3  vNormal;
in vec3  vPos;
in float vBg;
in float vRank;

vec3 hueRot(vec3 c, float a)
{
    const vec3 k = vec3(0.57735);
    float ca = cos(a);
    return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}

float hash11(float n) { return fract(sin(n * 12.9898) * 43758.5453); }

float noise3(vec3 p)
{
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n = i.x + i.y * 57.0 + i.z * 113.0;
    return mix(mix(mix(hash11(n), hash11(n + 1.0), f.x),
                   mix(hash11(n + 57.0), hash11(n + 58.0), f.x), f.y),
               mix(mix(hash11(n + 113.0), hash11(n + 114.0), f.x),
                   mix(hash11(n + 170.0), hash11(n + 171.0), f.x), f.y), f.z);
}

float fbm3(vec3 p)
{
    float v = 0.0, a = 0.5;
    for( int i = 0; i < 4; ++i ) { v += a * noise3(p); p *= 2.02; a *= 0.5; }
    return v;
}

float starsField(vec3 dir, float density)
{
    vec3 g = floor(dir * 210.0);
    float h = hash11(dot(g, vec3(1.0, 57.0, 113.0)));
    return step(1.0 - density, h) * (0.35 + 0.65 * hash11(h * 31.7));
}

float materialExposure(sampler2DArray tex)
{
    vec3 avg = textureLod(tex, vec3(0.5, 0.5, 0.0), 20.0).rgb;
    float l = dot(avg, vec3(0.299, 0.587, 0.114));
    return clamp(0.20 / max(l, 0.02), 0.30, 2.0);
}

// Deep sky with a distant front. The formation has to be flying somewhere, and
// a plain black field gives the eye nothing to measure the motion against.
vec3 renderSky(vec3 dir, vec3 tint)
{
    float n1 = fbm3(dir * 1.7 + vec3(time * 0.004, 0.0, 0.0));
    vec3 col = vec3(0.014, 0.016, 0.026);
    col += tint * 0.30 * smoothstep(0.40, 0.85, n1) * (0.35 + 0.30 * audioSwell);
    col += vec3(1.0) * starsField(dir, 0.0022);
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
    float hue = (hueP > 0.01 ? hueP : 0.0);
    vec3 tint = hueRot(vec3(0.45, 0.78, 1.0), tintP);

    if( vBg > 0.5 )
    {
        fragColor = vec4(renderSky(normalize(vPos), tint), 1.0);
        return;
    }

    vec3 n = normalize(vNormal);
    // Relief from the material's normal map, where the asset has one.
    n = perturbNormal(texMeshMaterial, texMeshMaterialLayers, vUV, n, vPos, 1.0);
    vec3 viewDir = normalize(-vPos);

    vec3 base = vec3(0.45);
    if( texMeshMaterialLayers > 0 )
        base = texture(texMeshMaterial, vec3(vUV, 0.0)).rgb * materialExposure(texMeshMaterial);

    float lam = max(dot(n, normalize(vec3(-0.42, 0.66, -0.62))), 0.0);
    vec3 col = base * (0.40 + 1.85 * lam);

    // The running light: a bright band travelling down the formation. This is
    // the ONLY per-craft variation, and it is what turns N copies into a fleet
    // under one command instead of a swarm.
    float wave = fract(vRank * 3.0 - time * 0.35 - audioAdvance * 0.15);
    float pip = smoothstep(0.0, 0.06, wave) * (1.0 - smoothstep(0.06, 0.16, wave));
    col += tint * pip * (0.9 + 1.8 * audioSwell);

    // Engine glow on the trailing faces, flaring with the kick.
    float aft = pow(max(-n.z, 0.0), 2.0);
    col += tint * aft * (0.30 + 1.5 * audioKick);

    float rim = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
    col += tint * rim * 0.30;

    if( hue > 0.001 ) col = hueRot(col, 0.12 * sin(hue));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
