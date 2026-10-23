//@doc
 * @brief EXEMPLAR INPAINT FRONT SPREAD: Criminisi's method: a hole in the picture is filled from its edge with the patches that fit the surroundings best; the picture shows a front that runs across the photo and renews it, with visible patches at the front.  Ahead of the front lies a pale, grey hole; behind it the photo
 * is built from patches shifted by amounts that die out with the distance from the front.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the front runs (integrated); it sweeps again when it has crossed the picture
 *   audioSwell   -> the width of the zone of visible patches
 *
 * Knobs: sizeP (the size of the patches), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    float ang = 0.4 + 0.2 * sin(0.01 * audioAdvance + 0.015 * sceneTime);
    vec2 ax = vec2(cos(ang), sin(ang));
    float cyc = fract(0.012 * audioAdvance + 0.02 * sceneTime);
    float front = (cyc * 1.5 - 0.75) * asp * 0.85;
    float u = dot(p, ax) - front;
    float S = 0.05 + 0.06 * clamp(sizeP, 0.0, 1.0);
    vec2 g = p / S;
    vec2 gi = floor(g);
    float zone = 0.1 + 0.35 * clamp(audioSwell, 0.0, 1.0);
    float d1 = 1e3;
    float d2 = 1e3;
    vec2 best = vec2(0.0);
    for (int dy = -1; dy <= 1; ++dy)
        for (int dx = -1; dx <= 1; ++dx) {
            vec2 cj = gi + vec2(float(dx), float(dy));
            vec2 h = hash22(cj);
            vec2 pt = cj + 0.5 + 0.4 * (h - 0.5) * 2.0;
            float d = length(g - pt);
            if (d < d1) { d2 = d1; d1 = d; best = cj; } else if (d < d2) d2 = d;
        }
    vec2 h = hash22(best + 9.0);
    float behind = smoothstep(0.0, 0.03, -u);
    float amp = exp(-max(-u, 0.0) / zone);
    vec2 off = (h - 0.5) * 2.0 * 0.18 * amp;
    vec3 c = imgLod((p + off) * 0.85 + 0.5, 0.6);
    float seam = (1.0 - smoothstep(0.0, 0.04, d2 - d1)) * amp;
    vec3 patch_ = c * (1.0 - 0.5 * seam);
    vec3 hole = vec3(luma(imgLod(p * 0.85 + 0.5, 3.0))) * 0.35 + vec3(0.12, 0.13, 0.16);
    float line = exp(-pow(u / 0.008, 2.0));
    finish(mix(hole, patch_, behind) * 1.1 + vec3(1.0, 0.9, 0.6) * line * 0.25);
}
