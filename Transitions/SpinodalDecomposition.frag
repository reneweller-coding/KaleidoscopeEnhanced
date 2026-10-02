#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file SpinodalDecomposition.frag
 * @brief TRANSITION SPINODAL DECOMPOSITION: the two scenes demix like an alloy
 * quenched below its miscibility gap -- an interpenetrating labyrinth with one
 * scene in each phase, coarsening until one phase has taken the frame.
 *
 * Spinodal decomposition has no nucleation step: the mixture is unstable
 * everywhere at once, so it separates by AMPLIFYING one wavelength of its own
 * fluctuation across the whole volume simultaneously.  That is why it is built
 * here as a band-limited field thresholded against a level, rather than as
 * blobs grown from seeds -- every domain appears where the fluctuation already
 * was, not where a seed was placed.
 *
 * The level sweeping across that field is the COMPOSITION sweeping across the
 * gap.  Near the ends the mixture is off-critical and the minority phase comes
 * out as separate domains; in the middle it is critical and the two phases are
 * bicontinuous -- the connected labyrinth this is named for.  Both stages are
 * real, and the sweep is what walks between them.
 *
 * The second law of the process is coarsening: the characteristic length grows
 * as the cube root of time, because the driving force is the interface energy.
 * The wavelength here follows that law, so the labyrinth gets visibly coarser
 * as the turn runs instead of just fading.
 *
 * The interfaces themselves carry energy, which is why they light up.
 *
 * Audio Reactivity:
 *   audioValence -> which phase is winning, and how fast (colour)
 *   audioHigh    -> the light on the interfaces (light)
 *   audioSwell  -> the interface width (slow)
 *
 * Per-activation variety: scaleP, coarseP, hueP.
 */

uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioPhase;   ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioSwell;   ///< slow loudness swell: the only envelope allowed to shape geometry
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioCentroid;   ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioSubBass;   ///< Sub-bass band level, 0..1.
uniform float audioBass;   ///< Bass band level, 0..1.
uniform float audioMid;   ///< Mid band level, 0..1.
uniform float audioHigh;   ///< High band level, 0..1.
uniform float audioFlux;   ///< Spectral flux (how fast the spectrum changes), 0..1.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float scaleP;   ///< Scale knob.
uniform float coarseP;
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

const float PI = 3.14159265358979;   ///< Pi.

/// @brief Pseudo-random number 0..1 from a 2D point.
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
/// @brief Smooth 2D value noise, 0..1.
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}

/// A band-limited field: one wavelength amplified, its neighbours suppressed.
/// That narrow band is what makes a labyrinth instead of clouds.
float banded(vec2 p, float k)
{
    float a = noise2(p * k);
    float b = noise2(p * k * 2.0 + 17.3);
    float c = noise2(p * k * 0.5 + 41.7);
    // Difference of scales = a band pass; the centre scale survives.
    return (a - 0.5) * 2.0 - (b - 0.5) * 0.55 - (c - 0.5) * 0.75;
}

/// @brief Entry point of this shader stage (the file description says what it draws).
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
    float age = 0.05 + d * 1.6 * crs;   // constant: an envelope on a scale re-lays the whole pattern (speed pass 14.09.2026)
    float k = (13.0 * sc) / pow(age, 0.3333);

    float fld = banded(p, k);

    // The level sweeps from above every value to below every one, so one phase
    // owns the frame at each end and the two ends are the untouched scenes.
    float w = 0.10 + 0.16 * clamp(audioSwell, 0.0, 1.0);
    // The level has to sweep from BELOW the field's minimum to ABOVE its
    // maximum, in that order: below means "no pixel has flipped yet", above
    // means "every pixel has".  The band pass reaches about +-1.65, so +-2.0
    // clears it with the widest edge.  Running this the other way round leaves
    // the OLD scene standing at d=1, which is invisible in a labyrinth of two
    // pictures and is exactly what the endpoint check caught.
    float lvl = mix(-2.0, 2.0, smoothstep(0.0, 1.0, d));
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
