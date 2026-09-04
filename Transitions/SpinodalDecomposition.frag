#version 330 core
out vec4 fragColor;
/**
 * @file SpinodalDecomposition.frag
 * @brief TRANSITION SPINODAL DECOMPOSITION: the two scenes demix like an alloy
 * quenched below its miscibility gap -- an interpenetrating labyrinth with one
 * scene in each phase, coarsening until one phase has taken the frame.
 *
 * Spinodal decomposition has no nucleation step: the mixture is unstable
 * everywhere at once, so it separates by AMPLIFYING one wavelength of its own
 * fluctuation across the whole volume simultaneously.  That is why the pattern
 * is a connected labyrinth of two phases with no droplets and no seeds -- and
 * why it is built here as a band-limited field thresholded against a level,
 * rather than as growing blobs.
 *
 * The second law of the process is coarsening: the characteristic length grows
 * as the cube root of time, because the driving force is the interface energy.
 * The wavelength here follows that law, so the labyrinth gets visibly coarser
 * as the turn runs instead of just fading.
 *
 * The interfaces themselves carry energy, which is why they light up.
 *
 * Audio Reactivity:
 *   audioBass    -> the coarsening rate (slow)
 *   audioValence -> which phase is winning, and how fast (colour)
 *   audioHigh    -> the light on the interfaces (light)
 *   audioSwell   -> the interface width (slow)
 *
 * Per-activation variety: scaleP, coarseP, hueP.
 */

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioPhase;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioKick;
uniform float audioCentroid;
uniform float audioValence;
uniform float audioSubBass;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioFlux;
uniform float audioChromaHue;

uniform float scaleP;
uniform float coarseP;
uniform float hueP;

const float PI = 3.14159265358979;

float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}

// A band-limited field: one wavelength amplified, its neighbours suppressed.
// That narrow band is what makes a labyrinth instead of clouds.
float banded(vec2 p, float k)
{
    float a = noise2(p * k);
    float b = noise2(p * k * 2.0 + 17.3);
    float c = noise2(p * k * 0.5 + 41.7);
    // Difference of scales = a band pass; the centre scale survives.
    return (a - 0.5) * 2.0 - (b - 0.5) * 0.55 - (c - 0.5) * 0.75;
}

void main()
{
    float sc  = (scaleP  > 0.0) ? scaleP  : 1.0;
    float crs = (coarseP > 0.0) ? coarseP : 1.0;
    float hue = (hueP    > 0.0) ? hueP    : 0.0;

    float aspect = resolution.x / resolution.y;
    vec2  uv = gl_FragCoord.xy / resolution;
    vec2  p  = (uv - 0.5) * vec2(aspect, 1.0);

    float d   = clamp(1.0 - interpolation, 0.0, 1.0);
    float arc = sin(d * PI);

    // Coarsening: the characteristic length grows as the cube root of time.
    float age = 0.05 + d * 1.6 * crs * (0.7 + 0.6 * clamp(audioBass, 0.0, 1.0));
    float k = (13.0 * sc) / pow(age, 0.3333);

    float fld = banded(p, k);

    // The level sweeps from above every value to below every one, so one phase
    // owns the frame at each end and the two ends are the untouched scenes.
    float w = 0.10 + 0.16 * clamp(audioSwell, 0.0, 1.0);
    float lvl = mix(1.35, -1.35, smoothstep(0.0, 1.0, d));
    // Which phase wins is nudged by the mood, not decided by it.
    lvl += (clamp(audioValence, 0.0, 1.0) - 0.5) * 0.25 * arc;
    float phase = smoothstep(lvl + w, lvl - w, fld);

    vec3 col = mix(texture(tex0, uv).rgb, texture(tex1, uv).rgb, phase);

    // The interface carries energy: a thin bright seam between the phases.
    float seam = exp(-pow((fld - lvl) / (w * 0.85), 2.0));
    col += vec3(0.85, 0.88, 1.0) * seam * arc
         * (0.07 + 0.22 * clamp(audioHigh * 2.0, 0.0, 1.0));
    // And the phases differ slightly in reflectivity, the way two alloys do.
    col *= 1.0 + (phase - 0.5) * 0.16 * arc;

    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
