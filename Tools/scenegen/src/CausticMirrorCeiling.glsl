//@doc
 * @brief CAUSTIC MIRROR CEILING: a wavy mirror below throws the light of a lamp up onto a ceiling, seen from beneath:
 * the reflected rays bunch where the mirror's curvature focuses them, into a net of bright caustic lines -- and the
 * ceiling is folded into a kaleidoscope, so the net is a turning mandala of light.  Optics: a point x of the mirror
 * sends its ray to x + 2 H grad h(x) on the ceiling; the brightness there is the inverse of how much that mapping
 * stretches area, 1 / |det J|, J = I + 2 H Hess h, computed from the waves' second derivatives directly.  One colour
 * family from the photo, the photo tinting the light.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBass    -> the mirror's waviness (the caustic net tightens and sharpens)
 *   audioAdvance -> the waves run (integrated) and the mandala turns
 *   audioSwell   -> the light's glow
 *
 * Knobs: foldP (the kaleidoscope's sides), waveP (the waves' base height), hueP.  Distinct from
 * TextureCausticCeiling, which has water and no fold.
//@params foldP waveP
//@audio audioBass audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float sides = floor(5.0 + 4.0 * clamp(foldP, 0.0, 1.0));
    float amp = (0.5 + 0.5 * clamp(waveP, 0.0, 1.0)) * (0.7 + 0.6 * clamp(audioBass, 0.0, 1.0));
    float run = 0.15 * sceneTime + 0.6 * audioAdvance;
    float turn = 0.02 * sceneTime + 0.1 * audioAdvance;
    // the ceiling folded into a kaleidoscope: the point on the mirror below this ceiling point (near the identity)
    vec2 k = kaleidoUV(rot2(turn) * p * 0.9 + 0.5, sides) - 0.5;
    vec2 x = k * 6.0;
    // the waves: three crossing trains; their Hessian gives the focusing
    mat2 hess = mat2(0.0);
    for (int i = 0; i < 3; ++i) {
        float fi = float(i);
        vec2 kv = vec2(cos(2.1 * fi + 0.4), sin(2.1 * fi + 0.4)) * (1.3 + 0.4 * fi);
        float ph = dot(x, kv) - run * (1.0 + 0.2 * fi);
        float c = -cos(ph) * amp / (1.0 + fi * 0.6);
        hess += c * mat2(kv.x * kv.x, kv.x * kv.y, kv.x * kv.y, kv.y * kv.y);
    }
    mat2 J = mat2(1.0) + 1.2 * hess;
    float det = abs(J[0][0] * J[1][1] - J[0][1] * J[1][0]);
    float light = min(1.0 / max(det, 0.02), 30.0) * (0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0));
    vec3 tint = imgLod(k * 0.8 + 0.5, 3.0);
    vec3 col = famLight(fh, 0.2 + 0.6 * luma(tint), 0.3 * smoothstep(3.0, 15.0, light)) * light * 0.12;
    col += famCol(fh, 0.4) * 0.03;
    finish(famExpose(col, 1.30, 1.00, 0.03, fh));
}
