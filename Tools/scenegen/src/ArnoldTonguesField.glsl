//@doc
 * @brief ARNOLD TONGUES FIELD: the circle map theta -> theta + Omega - K / (2 pi) sin(2 pi theta) over the plane of
 * its two parameters -- the mode-locking tongues: wedges of rational winding numbers (1/2, 1/3, 2/5 ...) rising
 * from the axis, widening, overlapping into chaos above K = 1.  The window wanders slowly through the tongues, so
 * the wedges sweep past like the teeth of a vast comb; each winding number reads its own tile of the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> how high into the coupling the window reaches (loud: into the chaos above K = 1)
 *   audioAdvance    -> the window wanders along Omega (integrated)
 *   audioKick       -> the tongues' edges flash (light)
 *
 * Knobs: widthP (how wide a range of Omega the frame shows), itersP (iterations: sharper tongues), photoP (photo
 * share), hueP.
//@params widthP itersP photoP
//@audio audioSwell audioKick
//@body
void main()
{
    vec2 p = screenP();
    vec2 q = vec2(p.x, abs(p.y));                               // mirrored about the middle: tongues from both edges
    float width = 0.25 + 0.3 * clamp(widthP, 0.0, 1.0);
    float om0 = 0.08 + 0.35 * (0.5 + 0.5 * sin(0.02 * sceneTime + 0.004 * audioAdvance));   // away from the big 0/1 tongue
    float omega = om0 + q.x / 1.7777778 * width;
    float kmax = 0.75 + 0.35 * clamp(audioSwell, 0.0, 1.0);
    float K = (0.5 - q.y) * 2.0 * kmax;
    int n = 60 + int(80.0 * clamp(itersP, 0.0, 1.0));
    float th = 0.0, tot = 0.0;
    for (int i = 0; i < 140; ++i) {
        if (i >= n) break;
        float d = omega - K / 6.2831853 * sin(6.2831853 * th);
        th += d;
        tot += d;
    }
    float wnum = tot / float(n);                                // the winding number
    // the nearest simple fraction (denominator up to 8): a tongue, or the quasi-periodic gaps between them
    float bestErr = 1.0, bestQ = 9.0, bestP = 0.0;
    for (int qd = 1; qd <= 8; ++qd) {
        float fq = float(qd);
        float pn = floor(wnum * fq + 0.5);
        float err = abs(wnum - pn / fq);
        if (err < bestErr - 1e-4) { bestErr = err; bestQ = fq; bestP = pn; }
    }
    float locked = 1.0 - smoothstep(0.0005, 0.004, bestErr);
    vec2 tile = vec2(mod(bestP, bestQ), bestQ);
    vec2 uv = p * 0.5 + 0.5 + tile * vec2(0.13, 0.21);
    vec3 photo = imgLod(uv, 0.6);
    vec3 tone = imgPalette(bestP / bestQ + 0.03 * audioPhase);
    vec3 col = mix(imgLod(p * 0.7 + 0.5, 2.5) * 0.25 + tone * 0.15 * fract(wnum * 7.0),
                   mix(tone * 1.2, photo, 0.3 + 0.6 * clamp(photoP, 0.0, 1.0)) * (1.2 - 0.08 * bestQ), locked);
    float edge = abs(dFdx(locked)) + abs(dFdy(locked));
    col += mix(tone, vec3(1.0), 0.5) * min(edge * 2.0, 1.0) * (0.25 + 0.5 * clamp(audioKick, 0.0, 1.0));
    finish(col);
}
