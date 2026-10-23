//@doc
 * @brief AUTOCORRELATION ECHO LATTICE: the autocorrelation: the photo is compared with itself at every offset, and the picture shows the lattice in which it repeats itself: bright peaks at the offsets of similarity, a carpet of echoes.  The offset range breathes slowly, and the
 * centre wanders.  Twelve places of the photo are compared with their displaced neighbours; the colour comes from the match.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the centre of the lattice wanders (integrated)
 *   audioHarmAdvance -> the range of offsets breathes
 *
 * Knobs: sizeP (the range of offsets), hueP.
//@params sizeP
//@audio audioAdvance audioHarmAdvance
//@body
void main()
{
    vec2 p = screenP();
    float range = (0.2 + 0.2 * clamp(sizeP, 0.0, 1.0)) * (0.8 + 0.3 * sin(0.05 * audioHarmAdvance + 0.03 * sceneTime));
    vec2 tau = (p + 0.05 * vec2(sin(0.02 * audioAdvance), cos(0.018 * audioAdvance))) * range;
    float acc = 0.0;
    float e0 = 0.0;
    float e1 = 0.0;
    vec3 colc = vec3(0.0);
    for (int k = 0; k < 12; ++k) {
        vec2 h = hash22(vec2(float(k), 4.1));
        vec2 x = 0.5 + 0.3 * (h - 0.5) * 2.0 + 0.02 * vec2(sin(0.05 * sceneTime + 6.28 * h.x), cos(0.04 * sceneTime + 6.28 * h.y));
        vec3 a = imgLod(x, 1.3);
        vec3 b = imgLod(x + tau, 1.3);
        float la = luma(a) - 0.5;
        float lb = luma(b) - 0.5;
        acc += la * lb;
        e0 += la * la;
        e1 += lb * lb;
        colc += b;
    }
    float r = acc / sqrt(max(e0 * e1, 1e-4));
    colc /= 12.0;
    float pk = smoothstep(0.35, 0.95, r * 0.5 + 0.5);
    vec3 pal = hsv2rgb(vec3(fract(0.55 + 0.5 * r), 0.55 + 0.3 * pk, 0.15 + 0.95 * pk * pk));
    vec3 col = mix(pal, colc * 1.25, 0.5);
    finish(col);
}
