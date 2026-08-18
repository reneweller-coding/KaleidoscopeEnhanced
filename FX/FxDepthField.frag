#version 330 core
out vec4 fragColor;
// FxDepthField.frag — depth of field, using the 3D scene's real depth.
// -----------------------------------------------------------------------
// This is the first effect that reads what the scene actually wrote into the
// depth attachment.  Everything a 2D visualiser can do with "fake" depth —
// radial blur, luminance-keyed softening — puts the blur in the wrong places;
// with the real buffer the focal plane is a physical distance, so the blur
// grows correctly on both sides of it and stops exactly at a silhouette.
//
// The focal plane drifts with the music: the bass pulls focus toward the
// camera, a kick snaps it back.  That is a camera operator's move, and it
// reads as intent rather than as an effect.
//
// depthValid tells us whether each layer's depth is real geometry at all.  A 2D
// effect leaves the far plane there, and blurring THAT would mean blurring the
// whole frame uniformly — so those layers pass through untouched.
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
uniform float audioSubBass;
uniform float audioHigh;

uniform float focusP;       // preset: resting focal distance
uniform float apertureP;    // preset: how fast things go soft
uniform float bokehP;       // preset: highlight blooming in the blur

const float PI = 3.14159265358979;

// A depth buffer is stored non-linearly — most of its precision sits near the
// camera.  Comparing raw values would put the whole scene in one bucket, so it
// has to be turned back into a distance first.
float linearise(float d)
{
    float n = nearFar.x, f = nearFar.y;
    float z = d * 2.0 - 1.0;
    return (2.0 * n * f) / (f + n - z * (f - n));
}

// 12-tap ring, golden-angle spaced.  A ring gathers a disc of confusion far
// more evenly than a box of the same tap count, which is what keeps the bokeh
// round instead of cross-shaped.
vec3 blurAt(sampler2D src, sampler2D dep, vec2 uv, float focus, float valid)
{
    vec3 c = texture(src, uv).rgb;
    if (valid < 0.5)
        return c;

    float z = linearise(texture(dep, uv).r);
    // Circle of confusion, signed distance from the focal plane in metres,
    // normalised so that the aperture setting behaves the same at any depth.
    float coc = abs(z - focus) / max(focus, 1.0);
    coc = clamp(coc * (0.6 + 3.2 * apertureP) - 0.04, 0.0, 1.0);

    // Kept modest on purpose: 12 taps spread over a large disc stop reading as
    // a blur and start reading as twelve copies.  Wider bokeh needs more taps,
    // not a bigger radius.
    float radius = coc * 0.014;
    if (radius < 0.0008)
        return c;

    // Rotate each pixel's tap pattern by a HASH, not by a smooth function of
    // uv.  Neighbouring pixels otherwise share almost the same twelve
    // directions, and the sampling turns into a visible weave rather than
    // averaging away.
    float rot = fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831853;

    vec3 sum = c;
    float wsum = 1.0;
    for (int i = 0; i < 12; ++i)
    {
        float a = float(i) * 2.3999632 + rot;
        float r = sqrt((float(i) + 0.5) / 12.0) * radius;
        vec2 o = vec2(cos(a), sin(a)) * r * vec2(1.0, resolution.x / resolution.y);
        vec2 su = clamp(uv + o, vec2(0.001), vec2(0.999));

        vec3 s = texture(src, su).rgb;
        float sz = linearise(texture(dep, su).r);

        // Reject samples that are IN FOCUS and in front: a sharp foreground
        // object must not smear into a blurred background, which is the
        // artefact that gives cheap depth of field its halos.
        float sc = clamp(abs(sz - focus) / max(focus, 1.0) * (0.6 + 3.2 * apertureP), 0.0, 1.0);
        float w = (sz > z - 0.05) ? 1.0 : sc;

        // Bright samples weigh more, which is what turns out-of-focus
        // highlights into visible bokeh discs instead of grey mush.
        w *= 1.0 + bokehP * 2.5 * max(max(s.r, s.g), s.b);

        sum += s * w;
        wsum += w;
    }
    return sum / wsum;
}

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution;

    // The focal plane rides the music.  audioSubBass pulls it in, the kick
    // snaps it back out — a rack focus on the beat.
    float focus = focusP * (26.0 - 13.0 * audioSubBass + 7.0 * audioKick);
    focus = clamp(focus, nearFar.x + 1.0, nearFar.y * 0.75);

    vec3 a = blurAt(tex0, texDepth0, uv, focus, depthValid.x);
    vec3 b = blurAt(tex1, texDepth1, uv, focus, depthValid.y);

    vec3 col = mix(b, a, clamp(interpolation, 0.0, 1.0));

    // A whisper of chromatic fringing in the strongly defocused corners, which
    // is what a fast lens actually does.
    float edge = length(uv - 0.5) * 1.4;
    col.r *= 1.0 + 0.05 * edge * (0.3 + apertureP);
    col.b *= 1.0 - 0.04 * edge * (0.3 + apertureP);

    col *= 1.0 + 0.10 * audioBeat;
    fragColor = vec4(col, 1.0);
}
