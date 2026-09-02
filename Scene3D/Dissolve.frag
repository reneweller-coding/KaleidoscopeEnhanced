#version 330 core
out vec4 fragColor;

/**
 * @file Dissolve.frag
 * @brief The object as a cloud of its own surface: every triangle is a splat
 * (the placement is in the geometry stage), drifting out on a curl field and
 * drawn back in. The silhouette survives as density, not as shape.
 *
 * Each splat keeps the colour its triangle had, so the cloud is not a uniform
 * dust -- it carries the object's own markings, and a hull's panels or a
 * statue's shadows stay faintly readable in the drift. That is what keeps the
 * object identifiable while it is scattered, and it is the reason to build the
 * particles from the mesh rather than from a random distribution.
 *
 *   audioSwell -> how far the cloud opens
 *   audioDrop  -> it blows out
 *   audioKick  -> a pulse through the cloud
 *   audioAdvance -> the curl field turns
 *
 * Per-instance: sizeP, looseP (travel), grainP (splat size), tintP.
 * Per-activation variety: hueP float palette offset (0..6.28).
 */

uniform sampler2DArray texMeshMaterial;
uniform int texMeshMaterialLayers;

uniform float time;
uniform float audioKick;
uniform float audioSwell;
uniform float audioAdvance;

uniform float hueP;
uniform float tintP;

in vec2  vUV;
in vec2  vQuad;
in vec3  vNormal;
in vec3  vPos;
in float vBg;
in float vLoose;

vec3 hueRot(vec3 c, float a)
{
    const vec3 k = vec3(0.57735);
    float ca = cos(a);
    return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}

float hash11(float n) { return fract(sin(n * 12.9898) * 43758.5453); }

float starsField(vec3 dir, float density)
{
    vec3 g = floor(dir * 200.0);
    float h = hash11(dot(g, vec3(1.0, 57.0, 113.0)));
    return step(1.0 - density, h) * (0.35 + 0.65 * hash11(h * 31.7));
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
    // Der Himmel dominiert das Bild: die Partikel sind spaerlich, also ist
    // SEIN Wert der Medianpixel.  Bei 0.012..0.026 mass die ganze Szene Luma
    // 4.7 bis 8.3 von 255 und wurde in ALLEN sieben Screening-Fenstern als
    // leer markiert.  Dunkel ist gewollt (mood=dark), unsichtbar nicht.
    vec3 col = mix(vec3(0.030, 0.034, 0.048), vec3(0.062, 0.058, 0.086), h);
    col += tint * 0.05 * (1.0 + 0.7 * audioKick)   // beat in the sky, not the body
         * pow(max(dot(dir, normalize(vec3(-0.3, 0.6, 0.74))), 0.0), 6.0);
    col += vec3(1.0) * starsField(dir, 0.0014);
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
    vec3 tint = hueRot(vec3(0.55, 0.80, 1.0), tintP);

    if( vBg > 0.5 )
    {
        fragColor = vec4(renderSky(normalize(vPos), tint), 1.0);
        return;
    }

    // Round the splat off. Without this every particle is a hard square and a
    // hundred thousand of them read as a mosaic rather than as dust.
    float r2 = dot(vQuad, vQuad);
    if( r2 > 1.0 ) discard;
    float fall = 1.0 - r2;
    fall *= fall;

    vec3 base = vec3(0.55);
    if( texMeshMaterialLayers > 0 )
        base = texture(texMeshMaterial, vec3(vUV, 0.0)).rgb * materialExposure(texMeshMaterial);

    vec3 n = normalize(vNormal);
    // Relief from the material's normal map, where the asset has one.
    n = perturbNormal(texMeshMaterial, texMeshMaterialLayers, vUV, n, vPos, 1.0);
    float lam = max(dot(n, normalize(vec3(-0.4, 0.7, -0.58))), 0.0);
    // Ebenfalls angehoben: der Koerper hob sich kaum vom Himmel ab.
    vec3 col = base * (0.55 + 1.20 * lam);

    // Loose particles glow and lose their shading: a speck of dust in the air
    // is lit from every side, so a hard light/dark split on it looks wrong.
    float loose = clamp(vLoose, 0.0, 1.0);
    col = mix(col, base * 0.85 + tint * 0.55, loose * 0.65);
    col += tint * loose * (0.30 + 0.85 * audioSwell);
    col += tint * audioKick * loose * 0.55;

    // The dither is not needed here -- the splats already overlap and the round
    // falloff does the blending -- but the EDGES have to fade or the cloud gets
    // a visible grid of quad boundaries where splats meet.
    col *= fall;

    if( hue > 0.001 ) col = hueRot(col, 0.12 * sin(hue));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
