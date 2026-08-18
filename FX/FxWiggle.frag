#version 330 core
out vec4 fragColor;
/**
 * @file FxWiggle.frag
 * @brief FX WIGGLE: hand-drawn "boil" -- the frame-to-frame line wobble of
 * traditional cel animation shot on twos/threes.
 *
 * A noise field re-seeds only on quantised time holds, never every frame
 * and never at a rate the music can shift, so the whole drawing steps as
 * one instead of dissolving into per-pixel video noise; a secondary coarse
 * field adds a registration drift and paper grain, also held.
 *   interpolation -> cross-fades the two wiggled scene layers
 *   audioLevel    -> strengthens the line-boil displacement
 *   audioKick     -> punches the displacement briefly
 *   audioChromaHue-> sets the hue of the highlight tint added in the highs
 *   audioHigh     -> adds a touch of that harmonic-hue tint
 *   audioSubBass  -> subtle overall brightness pulse
 *   audioBeat     -> subtle overall brightness pulse
 */
// FxWiggle.frag — the boil of hand-drawn animation.
// -----------------------------------------------------------------------
// Drawn animation wobbles because each frame was drawn separately: the line
// never lands in quite the same place twice.  Two properties make that read as
// hand-made rather than as a glitch, and both are easy to get wrong.
//
// It HOLDS.  Traditional animation is shot on twos or threes — the same drawing
// is exposed for two or three frames — so the wobble steps at eight to twelve
// times a second, not at sixty.  A displacement that updates every frame is
// video noise, not a boil.  So the noise field is seeded from a quantised time
// and jumps between holds.
//
// And the hold rate is CONSTANT.  It is tempting to drive it from the music, but
// `floor(time * rate)` with a rate that moves does not speed the boil up — it
// makes the step index jump backwards and forwards, and the drawing stutters at
// random.  The music changes how FAR the line moves, never how often.
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
uniform int   transStyle;

uniform float audioLevel;
uniform float audioBeat;
uniform float audioKick;
uniform float audioHigh;
uniform float audioSubBass;
uniform float audioChromaHue;
uniform float audioAmbient;

uniform float wiggleP;      // preset: how far the line moves
uniform float holdP;        // preset: holds per second (the "on twos" rate)
uniform float grainP;       // preset: paper grain

vec3 hue2rgb(float h)
{
    return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
}

float hash31(vec3 p)
{
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
}

float vnoise3(vec3 x)
{
    vec3 i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash31(i + vec3(0, 0, 0)), hash31(i + vec3(1, 0, 0)), f.x),
                   mix(hash31(i + vec3(0, 1, 0)), hash31(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(hash31(i + vec3(0, 0, 1)), hash31(i + vec3(1, 0, 1)), f.x),
                   mix(hash31(i + vec3(0, 1, 1)), hash31(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution;
    float aspect = resolution.x / max(resolution.y, 1.0);

    // The hold.  A fixed rate, quantised — see the note at the top on why this
    // must not follow the music.
    float rate = mix(6.0, 14.0, clamp(holdP, 0.0, 1.0));
    float hold = floor(time * rate);

    // A low-frequency field, re-seeded on every hold, so the whole drawing
    // shifts as one rather than dissolving into per-pixel noise.
    vec2 q = vec2(uv.x * aspect, uv.y) * 3.2;
    float nx = vnoise3(vec3(q, hold * 1.7)) - 0.5;
    float ny = vnoise3(vec3(q + 17.3, hold * 1.7 + 4.1)) - 0.5;

    // A second, coarser field gives the whole frame a slight drift, which is the
    // registration error of the paper on the pegs.
    float rx = hash31(vec3(hold, 3.0, 7.0)) - 0.5;
    float ry = hash31(vec3(hold, 11.0, 2.0)) - 0.5;

    float amp = (0.0022 + 0.0075 * clamp(wiggleP, 0.0, 2.0))
              * (0.55 + 0.9 * audioLevel + 0.6 * audioKick);
    vec2 off = (vec2(nx, ny) * 1.0 + vec2(rx, ry) * 0.35) * amp;

    vec3 a = texture(tex0, uv + off).rgb;
    vec3 b = texture(tex1, uv + off).rgb;
    vec3 col = mix(b, a, clamp(interpolation, 0.0, 1.0));

    // Paper grain, also held: grain that changes every frame is television snow.
    float g = hash31(vec3(floor(gl_FragCoord.xy * 0.5), hold));
    col *= 1.0 - clamp(grainP, 0.0, 1.0) * 0.16 * (g - 0.35);

    // A thin held vignette, as if the drawing were lit unevenly on the stand.
    vec2 c = (uv - 0.5) * vec2(aspect, 1.0);
    float vig = 1.0 - 0.28 * dot(c, c) * (0.7 + 0.5 * clamp(grainP, 0.0, 1.0));
    col *= vig;

    col *= 1.0 + 0.14 * audioBeat + 0.10 * audioSubBass;
    col += hue2rgb(fract(0.10 + 0.15 * sin(audioChromaHue))) * 0.04 * audioHigh;
    col = col / (1.0 + col * 0.10);
    fragColor = vec4(col, 1.0);
}
