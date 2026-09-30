//@doc
 * @brief SYMMETRY BREATHING: a kaleidoscope whose symmetry itself breathes --
 * the photograph folded into a rosette that grows smoothly from 3-fold to
 * 12-fold and back, each count blending continuously into the next (the
 * mirrors slide apart as a new wedge opens between them), while the
 * rosette rotates and the window into the photo drifts.  Rings of the
 * rosette carry different symmetries at once, so the pattern is a stack
 * of concentric kaleidoscopes, each breathing at its own pace.  Endless,
 * mirrorable, like the original Kaleidoscope.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> rotation (integrated, jump-free)
 *   audioAdvance    -> the window drifts through the photo (integrated)
 *   audioSwell      -> the symmetry grows toward more folds (slow)
 *   audioMode       -> round petals in major, pointed star in minor (superellipse)
 *   audioHarmChange -> the ring layers shift against each other (smoothed)
 *   audioHigh       -> the mirror seams glint (light)
 *
 * Knobs: minFoldP, maxFoldP (the breathing range), ringsP (how many ring
 * layers), hueP.
//@params minFoldP maxFoldP ringsP
//@audio audioPhase audioSwell audioMode audioHarmChange audioHigh
//@body
vec3 kaleido(vec2 p, float n, vec2 win, out float seam)
{
    float r = length(p);
    float a = atan(p.y, p.x);
    float sec = 3.14159265 / n;
    float fa = mod(a, 2.0 * sec);
    fa = abs(fa - sec);
    seam = min(fa, sec - fa) * r;
    vec2 f = vec2(cos(fa), sin(fa)) * r;
    return imgLod(win + f * 0.35, 0.3);
}

void main()
{
    vec2 p = screenP() * 2.0;
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    // Superellipse metric (like the original Kaleidoscope's power knob).
    float powV = mix(0.75, 1.4, clamp(audioMode, 0.0, 1.0));
    float r0 = pow(pow(abs(p.x), 2.0 * powV) + pow(abs(p.y), 2.0 * powV), 1.0 / (2.0 * powV));
    p = normalize(p + 1e-5) * r0;
    p = rot2(0.02 * sceneTime + 0.3 * audioPhase) * p;
    vec2 win = vec2(0.5) + 0.3 * vec2(sin(0.012 * sceneTime + 0.2 * audioAdvance), cos(0.01 * sceneTime + 0.15 * audioAdvance));
    float mn = 3.0 + 3.0 * clamp(minFoldP, 0.0, 1.0);
    float mx = mn + 3.0 + 6.0 * clamp(maxFoldP, 0.0, 1.0);
    // Ring layers: each ring has its own breathing phase.
    float nR = 1.0 + floor(clamp(ringsP, 0.0, 1.0) * 3.0);
    float ringW = 1.4 / nR;
    // Ring index as a continuous value; the colour is a blend of the two
    // nearest rings, so ring borders are soft.
    float rc = clamp(r0 / ringW - 0.5, 0.0, nR - 1.0);
    float r0i = floor(rc), rt = smoothstep(0.35, 0.65, rc - r0i);
    vec3 col = vec3(0.0); float seam = 0.0;
    for (int k = 0; k < 2; ++k) {
        float rr = min(r0i + float(k), nR - 1.0);
        float w = (k == 0) ? 1.0 - rt : rt;
        float breath = 0.5 - 0.5 * cos(sceneTime * (0.05 + 0.02 * rr) + rr * 1.7 + 0.8 * clamp(audioHarmChange, 0.0, 1.0));
        breath = clamp(breath + 0.3 * clamp(audioSwell, 0.0, 1.0), 0.0, 1.0);
        float nF = mix(mn, mx, breath);
        float n0 = floor(nF), f = smoothstep(0.0, 1.0, nF - n0);
        float s0, s1;
        vec2 pr = rot2(rr * 0.4) * p;
        vec3 c0 = kaleido(pr, n0, win + rr * 0.07, s0);
        vec3 c1 = kaleido(pr, n0 + 1.0, win + rr * 0.07, s1);
        col += w * mix(c0, c1, f);
        seam += w * mix(s0, s1, f);
    }
    float m = luma(imgLod(win, 8.0));
    col = (col - m) * 1.5 + m;
    vec3 hueF = hsv2rgb(vec3(fract(hueP * 0.159 + 0.2 * r0 + 0.02 * audioAdvance), 0.7, 1.0));
    col *= mix(vec3(1.0), mix(glowColour(imgLod(win, 5.0), p * 0.5, hueP * 0.159), hueF, 0.5) * 1.4, 0.4);
    col += vec3(1.0, 0.97, 0.92) * exp(-seam / (2.5 / resolution.y * 2.0)) * (0.04 + 0.25 * hi);
    finish(col * 1.05);
}
