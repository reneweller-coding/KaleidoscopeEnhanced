#version 330 core
out vec4 fragColor;
/**
 * @file FxAmbientOcclusion.frag
 * @brief FX AMBIENT OCCLUSION: screen-space ambient occlusion reconstructed
 * from the scene's real depth buffer, darkening and cooling creases where
 * nearby geometry blocks the ambient light.
 *
 * Rebuilds view-space position and normal per pixel from depth, samples a
 * dithered hemisphere kernel with a range check that avoids silhouette
 * haloing, and blends the occlusion of both incoming scene layers.
 *   interpolation -> cross-fades the two scene layers and their occlusion terms
 *   audioAmbient  -> raises/lowers the overall occlusion strength (breathing)
 *   audioSubBass  -> adds extra occlusion darkening
 *   audioKick     -> briefly lightens the occlusion on a hit
 *   audioBeat     -> subtle overall brightness pulse
 */
// FxAmbientOcclusion.frag — screen-space ambient occlusion from depth.
// -----------------------------------------------------------------------
// SSAO asks, for every pixel, how much of the hemisphere above its surface is
// blocked by nearby geometry.  Answering that needs a POSITION and a NORMAL,
// and the only thing available here is a depth buffer — so both are rebuilt.
//
// A depth sample plus the projection's field of view gives the view-space
// position: the pixel's screen coordinate is a ray direction, and the linear
// depth is how far along it the surface sits.  The normal then comes from the
// derivatives of that position across the screen.
//
// This is why the engine shares tanHalfFov and the clip planes rather than
// letting this shader guess them.  Guessed values do not look broken — they
// look like slightly wrong occlusion, which is far harder to notice and
// impossible to debug from the image.
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform sampler2D texDepth0;
uniform sampler2D texDepth1;
uniform vec2  depthValid;
uniform vec2  nearFar;
uniform float tanHalfFov;
uniform float interpolation;

uniform float audioLevel;
uniform float audioBeat;
uniform float audioKick;
uniform float audioSubBass;
uniform float audioAmbient;
uniform float audioChromaHue;

uniform float radiusP;      // preset: sampling radius in world units
uniform float strengthP;    // preset: how dark the creases go
uniform float tintP;        // preset: how much colour the shadow keeps

const int SAMPLES = 12;

float linearise(float d)
{
    float n = nearFar.x, f = nearFar.y;
    float z = d * 2.0 - 1.0;
    return (2.0 * n * f) / (f + n - z * (f - n));
}

// Screen position -> view-space position, using the depth at that pixel.
vec3 viewPos(sampler2D dep, vec2 uv)
{
    float z = linearise(texture(dep, uv).r);
    vec2 ndc = uv * 2.0 - 1.0;
    float aspect = resolution.x / max(resolution.y, 1.0);
    // The engine projects with -z forward, so the ray leans into negative z.
    vec3 ray = vec3(ndc.x * tanHalfFov * aspect, ndc.y * tanHalfFov, -1.0);
    return ray * z;
}

float occlusion(sampler2D dep, vec2 uv, float valid)
{
    if (valid < 0.5)
        return 0.0;

    float z = linearise(texture(dep, uv).r);
    if (z > nearFar.y * 0.95)
        return 0.0;                     // empty sky: nothing to occlude

    vec3 p = viewPos(dep, uv);

    // Normal from the derivatives of the reconstructed position.  Screen-space
    // derivatives cross silhouettes, so at an edge this normal is wrong — the
    // range check below is what keeps that from becoming a black outline.
    vec3 n = normalize(cross(dFdx(p), dFdy(p)));

    float radius = radiusP * 1.6;
    // Project the world radius into screen space: near geometry needs a wide
    // kernel, far geometry a narrow one.  A fixed pixel radius would make the
    // occlusion scale with distance, which is exactly backwards.
    float sr = radius * tanHalfFov / max(z, 0.4);
    sr = clamp(sr, 0.002, 0.09);

    float rot = fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831853;
    float occ = 0.0;

    for (int i = 0; i < SAMPLES; ++i)
    {
        float a = float(i) * 2.3999632 + rot;
        float r = sqrt((float(i) + 0.5) / float(SAMPLES)) * sr;
        vec2 su = clamp(uv + vec2(cos(a), sin(a)) * r * vec2(1.0, resolution.x / resolution.y),
                        vec2(0.002), vec2(0.998));

        vec3 q = viewPos(dep, su);
        vec3 d = q - p;
        float len = length(d);
        if (len < 1e-4)
            continue;

        // How far the neighbour lies along this surface's normal.  Positive
        // means it rises above the tangent plane, and therefore blocks light.
        float ndl = dot(n, d / len);

        // Range check: a neighbour much closer to the camera belongs to a
        // different surface entirely, and counting it would draw a dark halo
        // around every silhouette.
        float range = smoothstep(0.0, 1.0, radius / max(len, 1e-3));

        occ += max(ndl - 0.06, 0.0) * range;
    }

    return clamp(occ / float(SAMPLES) * (1.2 + 3.4 * strengthP), 0.0, 1.0);
}

// A cheap 4-tap blur of the occlusion, so the per-pixel dither in the sampling
// pattern averages out instead of showing as grain.
float occlusionSmooth(sampler2D dep, vec2 uv, float valid)
{
    vec2 t = 1.5 / resolution;
    return 0.25 * (occlusion(dep, uv + vec2( t.x,  t.y), valid)
                 + occlusion(dep, uv + vec2(-t.x,  t.y), valid)
                 + occlusion(dep, uv + vec2( t.x, -t.y), valid)
                 + occlusion(dep, uv + vec2(-t.x, -t.y), valid));
}

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution;

    vec3 a = texture(tex0, uv).rgb;
    vec3 b = texture(tex1, uv).rgb;
    vec3 col = mix(b, a, clamp(interpolation, 0.0, 1.0));

    float oa = occlusionSmooth(texDepth0, uv, depthValid.x);
    float ob = occlusionSmooth(texDepth1, uv, depthValid.y);
    float occ = mix(ob, oa, clamp(interpolation, 0.0, 1.0));

    // Breathe with the music, but never all the way off: an occlusion term
    // that pumps to zero makes the whole image look like it is losing contrast
    // rather than like light changing.
    occ *= 0.65 + 0.45 * audioAmbient + 0.25 * audioSubBass - 0.20 * audioKick;
    occ = clamp(occ, 0.0, 1.0);

    // Occluded areas do not just get darker, they get COOLER and keep some of
    // their own colour — light that reaches a crease has bounced off the walls
    // around it.  Multiplying straight to grey is what makes cheap SSAO read as
    // dirt smeared on the image.
    vec3 shadow = mix(vec3(0.10, 0.13, 0.22), col * 0.35, tintP);
    col = mix(col, shadow, occ);

    col *= 1.0 + 0.10 * audioBeat;
    fragColor = vec4(col, 1.0);
}
