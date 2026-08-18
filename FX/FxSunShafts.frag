#version 330 core
out vec4 fragColor;
/**
 * @file FxSunShafts.frag
 * @brief FX SUN SHAFTS: volumetric light shafts (godrays) that march toward
 * a wandering light source and are occluded by the scene's real depth
 * buffer, so shafts fall behind objects and cut off at their silhouettes.
 *
 * Falls back to no shafts where depth isn't valid (2D layers); shaft
 * intensity fades with distance from the light source, and a separate
 * unoccluded bloom marks the source itself.
 *   interpolation -> cross-fades the two scene layers and their shaft-occlusion terms
 *   audioKick     -> nudges the light source's position
 *   audioLevel    -> brightens the shafts
 *   audioChromaHue-> tints the shaft/bloom colour with the harmonic hue
 *   audioHigh     -> brightens the bloom around the light source
 *   audioSubBass  -> subtle overall brightness pulse
 *   audioBeat     -> subtle overall brightness pulse
 */
// FxSunShafts.frag — volumetric light shafts occluded by real geometry.
// -----------------------------------------------------------------------
// The classic radial-blur godray marches from each pixel toward the light and
// accumulates whatever the colour buffer holds.  It fails the moment anything
// bright sits in front of the light, because a colour buffer cannot say what is
// NEARER — a bright foreground object smears rays out of itself as if it were a
// hole in the sky.
//
// With the depth buffer the occlusion test is the real one: a sample blocks
// light if there is geometry between it and the eye, and shafts therefore fall
// BEHIND objects and are cut off by their silhouettes.  That is the difference
// between "glow" and "light in air".
//
// Depth also gives the shafts their falloff: near geometry is dense dust, the
// far plane is empty sky.
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform sampler2D texDepth0;
uniform sampler2D texDepth1;
uniform vec2  depthValid;
uniform vec2  nearFar;
uniform float interpolation;
uniform int   transStyle;

uniform float audioLevel;
uniform float audioBeat;
uniform float audioKick;
uniform float audioHigh;
uniform float audioSubBass;
uniform float audioChromaHue;

uniform float shaftP;       // preset: shaft strength
uniform float lengthP;      // preset: how far the march reaches
uniform float dustP;        // preset: haze density

const int STEPS = 28;

float linearise(float d)
{
    float n = nearFar.x, f = nearFar.y;
    float z = d * 2.0 - 1.0;
    return (2.0 * n * f) / (f + n - z * (f - n));
}

vec3 hue2rgb(float h)
{
    return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
}

// March from uv toward the light and measure how much of the path is OPEN.
//
// The tempting version accumulates the frame's own colour along the ray, the
// way a pure radial-blur godray does.  It is wrong here and the reason is worth
// stating: the colour at a sample is bright exactly where there is geometry —
// lit windows, a glowing surface — while the light only travels where there is
// NO geometry.  The two gates then cancel and the shafts vanish.  What travels
// along the ray is the sky's light; what the frame contributes is only the
// occluders.  So this returns openness, and the caller supplies the colour.
float shafts(sampler2D dep, vec2 uv, vec2 lightUV, float valid)
{
    if (valid < 0.5)
        return 0.0;

    vec2 delta = (lightUV - uv) * (lengthP * 0.85) / float(STEPS);

    // Per-pixel dither on the start offset.  Without it every pixel samples the
    // same 28 depths and the shafts show as concentric rings.
    float jitter = fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453);

    vec2 p = uv + delta * jitter;
    float acc = 0.0;
    float decay = 1.0;

    for (int i = 0; i < STEPS; ++i)
    {
        p += delta;
        vec2 sp = clamp(p, vec2(0.002), vec2(0.998));

        // The occlusion test: geometry ANYWHERE along the ray blocks the light
        // behind it.  This is the whole reason the depth buffer is needed.
        float z = linearise(texture(dep, sp).r);
        float open = smoothstep(nearFar.y * 0.35, nearFar.y * 0.80, z);

        acc += open * decay;
        decay *= 0.955 - 0.10 * dustP;
    }
    return acc / float(STEPS);
}

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution;

    // The light wanders slowly across the upper frame; the kick shoves it.
    vec2 lightUV = vec2(0.5 + 0.26 * sin(time * 0.043),
                        0.80 + 0.06 * sin(time * 0.031) + 0.05 * audioKick);

    vec3 a = texture(tex0, uv).rgb;
    vec3 b = texture(tex1, uv).rgb;
    vec3 col = mix(b, a, clamp(interpolation, 0.0, 1.0));

    float sa = shafts(texDepth0, uv, lightUV, depthValid.x);
    float sb = shafts(texDepth1, uv, lightUV, depthValid.y);
    float shaft = mix(sb, sa, clamp(interpolation, 0.0, 1.0));

    // Shafts fade with distance from the source, the way a beam of light in
    // haze does — without this the whole frame lifts uniformly and the light
    // stops having a position.
    float dl = length((uv - lightUV) * vec2(resolution.x / resolution.y, 1.0));
    shaft *= exp(-dl * 1.5);

    // Warm the shafts slightly and let the harmony tint them, bounded so they
    // stay sunlight rather than becoming a colour wash.
    vec3 tint = mix(vec3(1.0, 0.88, 0.68),
                    hue2rgb(fract(0.08 + 0.10 * sin(audioChromaHue))), 0.35);

    col += shaft * tint * (1.6 + 3.4 * shaftP) * (0.55 + 0.9 * audioLevel);

    // A soft bloom around the light itself, cut by nothing — this part IS just
    // glow, and it is what makes the source read as being in the scene.
    float d = length((uv - lightUV) * vec2(resolution.x / resolution.y, 1.0));
    col += tint * exp(-d * (7.0 - 3.0 * shaftP)) * (0.20 + 0.5 * audioHigh);

    col *= 1.0 + 0.12 * audioBeat + 0.10 * audioSubBass;
    col = col / (1.0 + col * 0.10);
    fragColor = vec4(col, 1.0);
}
