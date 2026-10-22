//@doc
 * @brief XY PHOSPHOR SCULPTURES: an oscilloscope screen seen close enough to fill the frame: several wire bodies drawn
 * at once by the beam -- turning tori, knotted loops, nested Lissajous shells -- overlap in a phosphor glow with a
 * soft afterglow, the bright beam slightly brighter where the curve turns slowly.  Each body is a closed 3D curve
 * sampled in a hundred segments, turned and projected with perspective, its lines glowing; a body fades in and out
 * with the music's loudness.  The phosphor's colour is a shade of the photo's colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the bodies' inner phases glide with the chord changes: the wires re-knot
 *   audioLevel       -> how many bodies are drawn
 *   audioAdvance     -> the bodies turn (integrated)
 *
 * Knobs: beamP (the beam's width), sizeP (the bodies' size), hueP.
//@params beamP sizeP
//@audio audioHarmAdvance audioLevel
//@body
/**  A point of a body's curve.
 *
 * @param t     The curve parameter (0..2 pi). (in)
 * @param k     Which body. (in)
 * @param h     The harmony's glide. (in)
 *
 * @return
 *   The 3D point.
 **/
vec3 body(float t, float k, float h)
{
    float a = 2.0 + mod(k, 3.0), b = 3.0 + mod(k + 1.0, 2.0);
    float w = 0.15 * sin(0.6 * h + k);
    if (k < 0.5) return vec3((1.0 + 0.35 * cos(b * t)) * cos(a * t), (1.0 + 0.35 * cos(b * t)) * sin(a * t), 0.35 * sin(b * t + w));
    if (k < 1.5) return vec3(sin(a * t + w), sin(b * t), sin((a + b) * 0.5 * t + 1.0));
    return vec3(cos(t) * (1.0 + 0.4 * cos(5.0 * t + w)), sin(t) * (1.0 + 0.4 * cos(5.0 * t + w)), 0.4 * sin(4.0 * t)) * 0.9;
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float h = max(audioHarmAdvance, 0.0);
    float beam = 0.0025 + 0.003 * clamp(beamP, 0.0, 1.0);
    float S = 0.32 + 0.14 * clamp(sizeP, 0.0, 1.0);
    float turn = 0.05 * sceneTime + 0.25 * audioAdvance;
    float count = 1.8 + 1.4 * clamp(audioLevel, 0.0, 1.0);
    vec3 col = vec3(0.0);
    for (int k = 0; k < 3; ++k) {
        float fk = float(k);
        float on = clamp(count - fk, 0.0, 1.0);
        if (on <= 0.0) continue;
        vec2 off = 0.45 * vec2(cos(2.0944 * fk + 0.3), 0.6 * sin(2.0944 * fk + 0.3)) * (fk > 0.5 ? 1.0 : 0.0);
        float best = 1e9, bestT = 0.0;
        vec2 pp = vec2(0.0);
        for (int i = 0; i <= 100; ++i) {
            float t = 6.2831853 * float(i) / 100.0;
            vec3 x = body(t, fk, h);
            x.xz = rot2(turn * (0.6 + 0.3 * fk) + fk) * x.xz;
            x.yz = rot2(0.4 * turn + 0.7 * fk) * x.yz;
            vec2 s = x.xy * S / (1.0 + 0.25 * x.z) + off;
            if (i > 0) {
                vec2 e = s - pp;
                float tt = clamp(dot(p - pp, e) / max(dot(e, e), 1e-8), 0.0, 1.0);
                float d = length(p - pp - e * tt);
                if (d < best) { best = d; bestT = length(e); }
            }
            pp = s;
        }
        // brighter where the beam moves slowly (short segments), the phosphor's afterglow round the lines
        float slow = clamp(0.01 / max(bestT, 0.002), 0.5, 2.0);
        float g = exp(-pow(best / beam, 2.0)) * slow + 0.3 * exp(-best / (beam * 6.0));
        col += famLight(fh, 0.3 + 0.2 * fk, 0.3) * g * on;
    }
    // the screen's graticule, faint
    vec2 gr = abs(fract(p * 5.0) - 0.5);
    col += famCol(fh, 0.4) * 0.03 * exp(-min(gr.x, gr.y) / 0.01);
    finish(famExpose(col, 3.51, 0.70, 0.03, fh));
}
