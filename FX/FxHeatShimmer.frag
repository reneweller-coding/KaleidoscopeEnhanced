#version 330 core
out vec4 fragColor;
/**
 * @file FxHeatShimmer.frag
 * @brief FX HEAT SHIMMER: refraction of the scene through turbulent heated
 * air, displacing pixels along the GRADIENT of an animated noise field
 * rather than the field's raw value.
 *
 * Displacement strength scales with scene brightness and, where available,
 * with depth/air-path (more haze between eye and surface bends light more);
 * each colour channel samples at a slightly different offset for a touch of
 * chromatic dispersion.
 *   interpolation -> cross-fades the two shimmer-displaced scene layers
 *   audioLevel    -> strengthens the heat-bend displacement
 *   audioKick     -> punches the displacement briefly
 *   audioSubBass  -> adds to the displacement strength
 *   audioHigh     -> brightens the heat-bloom highlight
 *   audioBeat     -> subtle overall brightness pulse
 */
// FxHeatShimmer.frag — air that has been heated, and bends light because of
// it.
// -----------------------------------------------------------------------
// Refraction through a turbulent medium is a gradient effect: a ray is bent by
// the SLOPE of the refractive index, not by its value.  So the displacement here
// is the gradient of a noise field rather than the field itself.  Displacing by
// the field directly is the common shortcut and it looks wrong in a way that is
// hard to name — the image slides in blobs instead of rippling, because a smooth
// field has no small-scale structure until you differentiate it.
//
// Two things decide where the air is hot: brightness, because bright things in
// this show are the emitters, and distance, because more air between the eye and
// the surface means more accumulated bending.  Depth is used when it exists; the
// effect degrades to brightness-only without it rather than switching off.
//
// The channels are sampled at slightly different offsets.  Dispersion is real —
// the bending depends on wavelength — and it is what stops the shimmer from
// reading as a plain wobble.
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
uniform float audioHigh;
uniform float audioSubBass;
uniform float audioChromaHue;
uniform float audioAmbient;

uniform float heatP;        // preset: how strongly the air bends
uniform float scaleP;       // preset: cell size of the turbulence
uniform float splitP;       // preset: chromatic dispersion

float hash21(vec2 p)
{
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

float vnoise(vec2 x)
{
    vec2 i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i + vec2(0, 0)), hash21(i + vec2(1, 0)), f.x),
               mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), f.x), f.y);
}

float fbm(vec2 p)
{
    return 0.58 * vnoise(p) + 0.28 * vnoise(p * 2.07) + 0.14 * vnoise(p * 4.13);
}

float linearise(float d)
{
    float n = nearFar.x, f = nearFar.y;
    float z = d * 2.0 - 1.0;
    return (2.0 * n * f) / (f + n - z * (f - n));
}

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution;
    float aspect = resolution.x / max(resolution.y, 1.0);

    // Rising air.  The phase advances with plain time at a fixed rate; scaling
    // absolute time by a live audio value would jump the whole field every time
    // the level moved, which reads as a flicker rather than as heat.
    float sc = mix(5.0, 22.0, clamp(scaleP, 0.0, 1.0));
    vec2 q = vec2(uv.x * aspect, uv.y) * sc;
    vec2 drift = vec2(time * 0.06, -time * 0.31);

    // The gradient of the field, by central difference.  This is the whole
    // technique: bend along the slope, not along the value.
    float e = 0.035;
    float n1 = fbm(q + drift + vec2(e, 0.0));
    float n2 = fbm(q + drift - vec2(e, 0.0));
    float n3 = fbm(q + drift + vec2(0.0, e));
    float n4 = fbm(q + drift - vec2(0.0, e));
    vec2 grad = vec2(n1 - n2, n3 - n4) / (2.0 * e);

    vec3 base = texture(tex0, uv).rgb;
    float lum = dot(base, vec3(0.299, 0.587, 0.114));

    float airPath = 1.0;
    if (depthValid.x > 0.5)
    {
        float z = linearise(texture(texDepth0, uv).r);
        // More air in the way means more accumulated bending, up to a point.
        airPath = clamp(z / 40.0, 0.15, 1.6);
    }

    float amt = (0.0016 + 0.0075 * clamp(heatP, 0.0, 2.0))
              * (0.35 + 1.1 * lum) * airPath
              * (0.55 + 0.9 * audioLevel + 0.7 * audioKick + 0.4 * audioSubBass);

    vec2 off = grad * amt;
    float split = amt * (0.25 + 0.9 * clamp(splitP, 0.0, 1.5));

    // Sample each channel at its own displacement.
    vec3 a;
    a.r = texture(tex0, uv + off * (1.0 + split)).r;
    a.g = texture(tex0, uv + off).g;
    a.b = texture(tex0, uv + off * (1.0 - split)).b;

    vec3 b;
    b.r = texture(tex1, uv + off * (1.0 + split)).r;
    b.g = texture(tex1, uv + off).g;
    b.b = texture(tex1, uv + off * (1.0 - split)).b;

    vec3 col = mix(b, a, clamp(interpolation, 0.0, 1.0));

    // A faint heat bloom where the air is worked hardest, so the distortion is
    // visible even across flat areas that have no detail to displace.
    float shimmer = clamp(length(grad) * 0.30, 0.0, 1.0);
    col += vec3(1.0, 0.72, 0.45) * shimmer * lum * (0.10 + 0.30 * clamp(heatP, 0.0, 2.0))
         * (0.4 + 1.0 * audioHigh);

    col *= 1.0 + 0.10 * audioBeat;
    col = col / (1.0 + col * 0.12);
    fragColor = vec4(col, 1.0);
}
