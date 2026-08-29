#version 330 core
out vec4 fragColor;

/**
 * @file Condensation.frag
 * @brief Gas resolving into an object. For most of the scene there is only a
 * slowly stirring volume; then a shape starts to be implied by where the fog is
 * thicker, and by the end the thing is simply there. The migration itself is in
 * the geometry stage.
 *
 * Density without blending: the mesh path draws opaque, so a real volume cannot
 * be accumulated by alpha. Instead each puff DISCARDS most of its fragments on
 * an ordered threshold, and where puffs overlap more of them survive -- the
 * accumulation is the density. Discarded fragments write no depth either, so
 * the volume stays correct whatever order the puffs happen to be drawn in,
 * which for 150k unsorted primitives is the only workable answer.
 *
 * The colour comes from the model's own material even while it is gas, so the
 * cloud is already faintly the colour the object will turn out to be. That
 * quiet foreshadowing is what makes the resolve feel earned rather than
 * arbitrary.
 *
 *   sceneProgress -> the resolve (geometry stage)
 *   audioSwell    -> how brightly the gas glows
 *   audioKick     -> a pulse through the volume
 *
 * Per-instance: sizeP, cloudP (initial cloud size), puffP (puff size), tintP.
 * Per-activation variety: hueP float palette offset (0..6.28).
 */

uniform sampler2DArray texMeshMaterial;
uniform int texMeshMaterialLayers;

uniform float time;
uniform float audioKick;
uniform float audioSwell;
uniform float audioAdvance;
uniform float sceneProgress;

uniform float hueP;
uniform float tintP;

in vec2  vUV;
in vec2  vQuad;
in vec3  vNormal;
in vec3  vPos;
in float vBg;
in float vFormed;

vec3 hueRot(vec3 c, float a)
{
    const vec3 k = vec3(0.57735);
    float ca = cos(a);
    return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}

float hash11(float n) { return fract(sin(n * 12.9898) * 43758.5453); }

float starsField(vec3 dir, float density)
{
    // Jittered point stars, NOT lattice cells. The old version lit the
    // whole cube-lattice cell that hashed as a star, and a lattice
    // projected onto the sky reads as ROWS of dots along its axes --
    // plainly visible wherever the sky is mostly stars (reported on
    // Fleet). Each star is now a small round point at a hashed offset
    // inside its cell, so no two stars share an axis to line up on.
    vec3 g = floor(dir * 210.0);
    vec3 f = fract(dir * 210.0);
    float h = hash11(dot(g, vec3(1.0, 57.0, 113.0)));
    if( h < 1.0 - density ) return 0.0;
    vec3 jit = vec3(hash11(h * 91.7), hash11(h * 53.1), hash11(h * 27.9))
             * 0.6 + 0.2;
    float d = length(f - jit);
    return smoothstep(0.30, 0.05, d) * (0.35 + 0.65 * hash11(h * 31.7));
}

float bayer4(vec2 p)
{
    int x = int(mod(p.x, 4.0)), y = int(mod(p.y, 4.0));
    int i = y * 4 + x;
    float m[16] = float[16](0.0, 8.0, 2.0,10.0, 12.0, 4.0,14.0, 6.0,
                            3.0,11.0, 1.0, 9.0, 15.0, 7.0,13.0, 5.0);
    return (m[i] + 0.5) / 16.0;
}

float materialExposure(sampler2DArray tex)
{
    vec3 avg = textureLod(tex, vec3(0.5, 0.5, 0.0), 20.0).rgb;
    float l = dot(avg, vec3(0.299, 0.587, 0.114));
    return clamp(0.20 / max(l, 0.02), 0.30, 2.0);
}

vec3 renderSky(vec3 dir, vec3 tint)
{
    float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 col = mix(vec3(0.010, 0.012, 0.020), vec3(0.024, 0.022, 0.034), h);
    col += tint * 0.06 * (1.0 + 0.7 * audioKick)   // beat in the sky, not the gas
         * pow(max(dot(dir, normalize(vec3(0.35, 0.5, 0.79))), 0.0), 8.0);
    col += vec3(1.0) * starsField(dir, 0.0018);
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
    vec3 tint = hueRot(vec3(0.60, 0.72, 1.0), tintP);

    if( vBg > 0.5 )
    {
        fragColor = vec4(renderSky(normalize(vPos), tint), 1.0);
        return;
    }

    float r2 = dot(vQuad, vQuad);
    if( r2 > 1.0 ) discard;
    float fall = 1.0 - r2;
    fall *= fall;

    float formed = clamp(vFormed, 0.0, 1.0);

    // Stochastic density. A loose puff keeps only a fraction of its fragments,
    // so a single one is nearly invisible and a hundred overlapping ones make a
    // solid-looking mass -- which is exactly how a volume should behave.
    float density = mix(0.16, 0.95, formed) * fall;
    if( density < bayer4(gl_FragCoord.xy) ) discard;

    vec3 base = vec3(0.55);
    if( texMeshMaterialLayers > 0 )
        base = texture(texMeshMaterial, vec3(vUV, 0.0)).rgb * materialExposure(texMeshMaterial);

    vec3 n = normalize(vNormal);
    // Relief from the material's normal map, where the asset has one.
    n = perturbNormal(texMeshMaterial, texMeshMaterialLayers, vUV, n, vPos, 1.0);
    float lam = max(dot(n, normalize(vec3(0.35, 0.68, -0.64))), 0.0);

    // Gas is lit from everywhere, a surface from one side. Crossfading between
    // those two lighting models along the resolve is what makes the material
    // appear to CONDENSE rather than simply move.
    // The two ends have to be EQUALLY bright, or the scene gets darker exactly
    // as its subject appears. Measured on the first version: mean frame luma
    // fell from 38 to 7 across the resolve, because the gas glow carried the
    // whole image and the surface term arriving in its place was a third as
    // strong. A reveal that dims as it reveals reads as the scene ending.
    vec3 gasCol  = base * 0.55 + tint * 0.55;
    vec3 surfCol = base * (0.50 + 2.10 * lam);
    vec3 col = mix(gasCol, surfCol, formed);

    col += tint * (1.0 - formed) * (0.25 + 0.75 * audioSwell);
    col += tint * audioKick * 0.35 * (1.0 - 0.6 * formed);

    // A rim on the finished body, so the silhouette is legible against the
    // remains of its own cloud.
    vec3 viewDir = normalize(-vPos);
    float rim = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
    col += tint * rim * formed * (0.45 + 0.6 * audioSwell);
    col *= 0.55 + 0.45 * fall;

    if( hue > 0.001 ) col = hueRot(col, 0.12 * sin(hue));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
