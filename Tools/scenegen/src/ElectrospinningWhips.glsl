//@doc
 * @brief ELECTROSPINNING WHIPS: electrospinning jets: from nozzles at the top thin glowing jets fall straight, then the
 * bending instability takes them and they whip into widening chaotic spirals, laying a mat of glowing fibres on the
 * collector below; the rougher the music, the wilder the whipping.  A jet is a curve whose radius grows after its
 * straight start and whose angle winds faster as it falls, with a slow wobble; it is drawn as sixty-four segments,
 * brighter on its near side.  The fibre mat is the level lines of drifting noise, faint and loopy.  The light is shades
 * of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioRoughness -> how wildly the jets whip (softened by the swell)
 *   audioAdvance   -> the whipping spirals turn (integrated) and the mat grows on
 *   audioSwell     -> the jets' glow
 *
 * Knobs: jetP (how many jets), loopP (how many loops a jet makes), hueP.
//@params jetP loopP
//@audio audioRoughness audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float N = floor(3.0 + 2.0 * clamp(jetP, 0.0, 1.0));
    float loops = 6.0 + 6.0 * clamp(loopP, 0.0, 1.0);
    float sw = clamp(audioSwell, 0.0, 1.0);
    float A = 0.06 + 0.22 * mix(sw, clamp(audioRoughness, 0.0, 1.0), 0.5);
    float run = 0.3 * sceneTime + 1.2 * audioAdvance;
    float slow = 0.02 * sceneTime + 0.08 * audioAdvance;
    vec3 col = famCol(fh, 0.45) * 0.015;
    // the fibre mat on the collector
    float matY = smoothstep(-0.12, -0.3, p.y);
    float fibres = exp(-pow((fract(fbm(4.0 * p + vec2(0.0, 0.3 * slow)) * 7.0) - 0.5) / 0.04, 2.0));
    col += famLight(fh, 0.4, 0.4) * fibres * matY * 0.35;
    for (int i = 0; i < 5; ++i) {
        float fi = float(i);
        if (fi >= N) break;
        float hi = fract(sin(fi * 12.9898) * 43758.5453);
        float cx = 1.5 * ((fi + 0.5) / N - 0.5);
        float best = 9.0, front = 0.5, sAt = 0.0;
        vec2 prev = vec2(cx, 0.5);
        for (int k = 1; k <= 64; ++k) {
            float s = float(k) / 64.0;
            float w = smoothstep(0.22, 1.0, s);
            float r = A * pow(w, 1.4) * (1.0 + 0.3 * sin(3.0 * s + slow + 6.0 * hi));
            float a = 6.2831853 * loops * s * s - run * (1.0 + 0.3 * hi) + 6.2831853 * hi;
            vec2 pt = vec2(cx + r * cos(a), 0.5 - 0.68 * s);
            vec2 ab = pt - prev, ap = p - prev;
            float d = length(ap - ab * clamp(dot(ap, ab) / max(dot(ab, ab), 1e-8), 0.0, 1.0));
            if (d < best) { best = d; front = 0.5 + 0.5 * sin(a); sAt = s; }
            prev = pt;
        }
        float core = exp(-pow(best / 0.0022, 2.0)), halo = exp(-best / 0.012);
        col += famLight(fh, 0.3 + 0.4 * hi, 0.5) * (core + 0.25 * halo) * (0.35 + 0.65 * front) * (0.6 + 0.6 * sw);
        col += famLight(fh, 0.5, 0.9) * exp(-dot(p - vec2(cx, 0.5), p - vec2(cx, 0.5)) / 0.0003) * 0.6;   // the nozzle
    }
    finish(col);
}
