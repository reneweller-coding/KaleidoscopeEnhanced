//@doc
 * @brief SPIRAL HALFTONE LINE: a single spiral whose line width follows the photo (spiral halftone); the spiral turns, and the number of turns glides.  An Archimedean spiral wound out of the middle of the picture, drawn in dark ink with a width that grows where the photo is dark; the pitch glides, so the
 * turns draw nearer and farther.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread  -> the number of turns (the pitch) glides (smoothed)
 *   audioAdvance -> the spiral turns (integrated)
 *
 * Knobs: sizeP (the line's strength), hueP.
//@params sizeP
//@audio audioSpread audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float r = length(p) + 1e-4;
    float th = atan(p.y, p.x);
    float pitch = 0.014 + 0.012 * (1.0 - clamp(audioSpread, 0.0, 1.0)) * 0.0 + 0.008 * clamp(audioSpread, 0.0, 1.0) + 0.002 * sin(0.04 * sceneTime);
    float s = r / pitch - th / 6.2831853 - 0.02 * audioAdvance - 0.03 * sceneTime;
    float fr = abs(fract(s) - 0.5) * 2.0;
    vec3 c = imgLod(p * 0.85 + 0.5, 1.0);
    float dark = clamp(1.0 - luma(c) * 1.1, 0.0, 1.0);
    float w = (0.05 + 0.9 * dark) * (0.6 + 0.6 * clamp(sizeP, 0.0, 1.0));
    float line = 1.0 - smoothstep(w - 0.1, w, fr);
    vec3 paper = vec3(0.95, 0.93, 0.88);
    vec3 ink = mix(vec3(0.04, 0.04, 0.06), c * 0.3, 0.35);
    finish(mix(paper, ink, line));
}
