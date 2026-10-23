//@doc
 * @brief SUNFLOWER PHOTO FIELD: a sunflower field: seeds laid out at the golden angle, each wearing the photo's colour at its place and sized by the photo's brightness there, so the photo appears as a head of seeds of different sizes;
 * the field turns slowly and zooms in without end, the seeds sliding outward as the angle between them quivers by a hair around the golden value.  The zoom follows the drive of the music, the quiver the chords.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the zoom (integrated)
 *   audioHarmAdvance -> the angle quivers around the golden value
 *   audioPhase      -> the field turns (integrated)
 *
 * Knobs: seedP (the size of the seeds), hueP.
//@params seedP
//@audio audioHarmAdvance
//@body
void main()
{
    vec2 p = screenP();
    float c = 0.022 * exp(0.5 * sin(0.01 * audioAdvance + 0.005 * sceneTime));
    float ga = 2.3999632 + 0.004 * sin(0.45 * audioHarmAdvance);
    float rot = 0.04 * audioPhase + 0.005 * sceneTime;
    vec2 q = rot2(-rot) * p;
    float r = length(q);
    float k0 = r * r / (c * c);
    float best = 1e9;
    vec2 bp = vec2(0.0);
    for (int i = -36; i <= 36; ++i) {
        float k = floor(k0) + float(i);
        if (k < 0.0) continue;
        float rr = c * sqrt(k);
        float th = k * ga;
        vec2 sp = rr * vec2(cos(th), sin(th));
        float d = length(q - sp);
        if (d < best) { best = d; bp = sp; }
    }
    vec3 col0 = imgLod(rot2(rot) * bp * 0.8 + 0.5, 2.0);
    float rad = 0.78 * c * (0.3 + 0.7 * luma(col0)) * (0.7 + 0.5 * clamp(seedP, 0.0, 1.0)) * 1.6;
    float seed = smoothstep(rad, rad * 0.8, best);
    vec3 bg = imgLod(p * 0.8 + 0.5, 4.5) * 0.12;
    float shade = 0.7 + 0.5 * smoothstep(rad, 0.0, best);
    finish(mix(bg, col0 * shade * 1.2, seed));
}
