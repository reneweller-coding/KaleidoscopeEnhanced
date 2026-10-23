//@doc
 * @brief BAND LAB: the photo cut into seven frequency bands (differences of its mip levels, from coarse masses down to
 * the finest grain) and every group of bands given a law of motion of its own: drifting, turning, breathing, shearing,
 * zooming, rippling, swirling, rolling in columns, flowing against its neighbour, or standing still.  Where every band
 * rests, their sum is exactly the photo; where they move at different rates the picture comes apart into layers of
 * detail that slide against each other, and the grain floats over the masses.  The walk gives one group a new law at
 * a time and cross-fades the two looks; a new section of the music gives all four groups new laws.  Four groups of ten
 * laws, thousands of looks; the photo keeps its own colours throughout.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> how far the laws move the bands (slow)
 *   audioSpread     -> the finest group's reach (the wider the spectrum, the more the grain travels)
 *   audioRoughness  -> the middle groups' ripple and shear
 *   audioPhase      -> the laws' clocks (integrated)
 *   audioSectionId/Age -> a new section re-rolls every group's law
 *
 * Knobs: seedP (the walk's seed: where the lab starts), speedP (the laws' clock), reachP (how far the bands travel), hueP.
//@params seedP speedP reachP
//@audio audioSwell audioSpread audioRoughness
//@body
/**  The place a band reads the photo at, moved by a law.
 *
 * @param uv     The place in the photo, 0..1. (in)
 * @param law    The law, 0..9: rest, drift, turn, breathe, shear, zoom, ripple, swirl, column waves, counter flow. (in)
 * @param t      The law's clock. (in)
 * @param amp    The amplitude, 0..1. (in)
 * @param phase  A phase that sets this group's law apart from the others. (in)
 *
 * @return
 *   The place to read.
 **/
vec2 bandLaw(vec2 uv, int law, float t, float amp, float phase)
{
    vec2 d = uv - 0.5;
    float a = amp * (0.7 + 0.3 * sin(phase));
    if (law == 1) return uv + 0.16 * a * vec2(cos(phase + 0.31 * t), sin(phase * 1.7 + 0.23 * t)) + 0.03 * a * t * vec2(cos(phase), sin(phase));
    if (law == 2) return 0.5 + rot2(0.7 * a * sin(0.4 * t + phase)) * d;
    if (law == 3) return 0.5 + d * (1.0 + 0.22 * a * sin(0.7 * t + phase));
    if (law == 4) return uv + vec2(0.35 * a * d.y * sin(0.5 * t + phase), 0.0);
    if (law == 5) return 0.5 + d * exp(0.5 * a * sin(0.25 * t + phase));
    if (law == 6) return uv + 0.06 * a * vec2(sin(9.0 * uv.y + 0.9 * t + phase), sin(8.0 * uv.x + 0.7 * t + 2.0 * phase));
    if (law == 7) return 0.5 + rot2(2.2 * a * exp(-4.0 * dot(d, d)) * sin(0.35 * t + phase)) * d;
    if (law == 8) return uv + vec2(0.04 * a * sin(0.6 * t + phase) * cos(4.0 * uv.y), 0.1 * a * sin(7.0 * uv.x + 0.5 * t + phase));
    if (law == 9) return uv + vec2(0.1 * a * sin(0.3 * t + phase) * sin(6.0 * uv.y + phase), 0.0);
    return uv;
}

/**  One look of the lab: the photo as the sum of its seven bands, each read where its group's law puts it.
 *
 * @param k    The class of each slot: the law of each group of bands. (in)
 * @param uv   The place, 0..1. (in)
 * @param t    The clock. (in)
 * @param amp  The amplitude of each group (x: finest .. w: coarsest). (in)
 *
 * @return
 *   The colour.
 **/
vec3 bandLook(ivec4 k, vec2 uv, float t, vec4 amp)
{
    vec3 sum = vec3(0.0);
    vec3 prev = vec3(0.0);
    for (int i = 0; i < 7; ++i) {
        int g = i < 2 ? 0 : (i < 4 ? 1 : (i < 6 ? 2 : 3));
        int law = g == 0 ? k.x : (g == 1 ? k.y : (g == 2 ? k.z : k.w));
        float a = g == 0 ? amp.x : (g == 1 ? amp.y : (g == 2 ? amp.z : amp.w));
        vec2 q = bandLaw(uv, law, t * (1.0 + 0.15 * float(i)), a, 1.3 * float(i) + 0.6 * float(g));
        float l0 = i == 0 ? 0.0 : (i == 1 ? 1.0 : (i == 2 ? 2.0 : (i == 3 ? 3.0 : (i == 4 ? 4.0 : (i == 5 ? 5.5 : 7.0)))));
        float l1 = i == 0 ? 1.0 : (i == 1 ? 2.0 : (i == 2 ? 3.0 : (i == 3 ? 4.0 : (i == 4 ? 5.5 : 7.0))));
        float gain = law == 0 ? 1.0 : 1.0 + 0.3 * a;                // moving bands stand out a little more
        if (i < 6) sum += gain * (imgLod(q, l0) - imgLod(q, l1));
        else sum += imgLod(q, l0);
    }
    return sum;
}

void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    labWalk(seedP * 83.0, ivec4(10, 10, 10, 10), 1.0);
    float sw = clamp(audioSwell, 0.0, 1.0);
    float reach = 0.45 + 0.55 * clamp(reachP, 0.0, 1.0);
    float t = (0.55 + 0.9 * clamp(speedP, 0.0, 1.0)) * (sceneTime * 0.6 + 6.0 * audioPhase);
    vec4 amp = reach * vec4(0.45 + 0.5 * clamp(audioSpread, 0.0, 1.0) + 0.4 * sw,
                            0.4 + 0.6 * clamp(audioRoughness, 0.0, 1.0) + 0.4 * sw,
                            0.5 + 0.7 * sw,
                            0.55 + 0.5 * sw);
    vec3 col = vec3(0.0);
    float ws = 0.0;
    for (int i = 0; i < 4; ++i) {
        if (gLabW[i] > 0.002) {
            col += gLabW[i] * bandLook(gLabK[i], uv, t, amp);
            ws += gLabW[i];
        }
    }
    finish(max(col / max(ws, 1e-3), 0.0) * 1.05);
}
