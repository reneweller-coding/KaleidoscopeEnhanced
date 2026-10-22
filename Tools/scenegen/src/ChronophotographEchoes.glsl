//@doc
 * @brief CHRONOPHOTOGRAPH ECHOES: after Marey's chronophotographs: glowing forms turning and travelling through a dark
 * room leave fading copies of themselves at fixed intervals, so each motion becomes a fan of echoes, and the many
 * forms' echoes weave into a dense fabric.  Each form -- a bar, an arc or a ring -- moves on its own slow path; its
 * echo k is the form as it was k intervals ago, drawn fainter the older it is.  The forms' light is shades of one
 * colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance       -> the forms' motion (integrated)
 *   audioSectionId/Age -> every new section changes the forms (bar, arc, ring; the light cross-faded)
 *   audioSwell         -> how many echoes stay
 *
 * Knobs: formP (how many forms), gapP (the interval between echoes), hueP.
//@params formP gapP
//@audio audioSectionId audioSectionPrev audioSectionAge audioSwell
//@body
/**  A form's distance at its state.
 *
 * @param q     The point. (in)
 * @param c     The form's centre. (in)
 * @param a     The form's turn. (in)
 * @param kind  0 bar, 1 arc, 2 ring. (in)
 *
 * @return
 *   The distance.
 **/
float formD(vec2 q, vec2 c, float a, float kind)
{
    vec2 d = rot2(a) * (q - c);
    if (kind < 0.5) return length(vec2(max(abs(d.x) - 0.2, 0.0), d.y));
    if (kind < 1.5) {
        float ang = atan(d.y, d.x);
        return abs(length(d) - 0.16) + 0.16 * max(abs(ang) - 1.2, 0.0);
    }
    return abs(length(d) - 0.1);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float forms = 5.0 + 2.0 * clamp(formP, 0.0, 1.0);
    float gap = 0.06 + 0.08 * clamp(gapP, 0.0, 1.0);
    float echoes = 5.0 + 9.0 * clamp(audioSwell, 0.0, 1.0);
    float t = 0.12 * sceneTime + 0.5 * audioAdvance;
    float m = smoothstep(0.0, 6.0, audioSectionAge);
    vec3 col = vec3(0.0);
    for (int f = 0; f < 7; ++f) {
        float ff = float(f);
        if (ff >= forms) break;
        float h1 = fract(sin(ff * 12.9898) * 43758.5453), h2 = fract(sin(ff * 78.233) * 43758.5453);
        float kA = mod(max(audioSectionPrev, 0.0) + ff, 3.0), kB = mod(max(audioSectionId, 0.0) + ff, 3.0);
        for (int k = 0; k < 14; ++k) {
            float fk = float(k);
            float on = clamp(echoes - fk, 0.0, 1.0);             // the last echo fades in and out, never pops
            if (on <= 0.0) break;
            float tk = t - fk * gap;
            vec2 c = vec2(0.75 * sin(tk * (0.5 + 0.3 * h1) + 6.0 * h1), 0.4 * sin(tk * (0.4 + 0.3 * h2) + 6.0 * h2 + 1.0));
            float a = tk * (1.0 + h1) + 3.0 * h2;
            // the two forms cross-fade in light (a blend of their distances would show neither)
            float dA = formD(p, c, a, kA), dB = formD(p, c, a, kB);
            float g = ((1.0 - m) * (exp(-pow(dA / 0.005, 2.0)) + 0.1 * exp(-dA / 0.02))
                       + m * (exp(-pow(dB / 0.005, 2.0)) + 0.1 * exp(-dB / 0.02))) * (1.0 - fk / 14.0) * on;
            col += famLight(fh, 0.15 + 0.7 * h1, 0.3 * (1.0 - fk / 14.0)) * g * (k == 0 ? 1.4 : 0.6);
        }
    }
    finish(col);
}
