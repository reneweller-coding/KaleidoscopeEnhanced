//@doc
 * @brief LIQUID LENS WOBBLE: liquid lenses wobble over the photo, each a soft drop of clear liquid that magnifies what
 * lies beneath it, its outline trembling: the magnified pieces swell and drift, new drops gather while old ones flatten
 * away.  A drop's height falls off from its middle to its trembling rim (1 - (r/R)^2); the picture under it is drawn
 * toward the drop's middle by that height, so the middle magnifies and the rim joins the picture seamlessly; the rim
 * catches a thin highlight and the dome a soft reflection.  The photo's colours, calmed toward one colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell     -> the wobble: the drops' rims tremble harder as the music swells
 *   audioPhrasePos -> each phrase a new drop gathers while an old one flattens away
 *   audioAdvance   -> the drops drift and the wobble runs (integrated)
 *
 * Knobs: dropP (how many drops), magP (how strongly they magnify), hueP.
//@params dropP magP
//@audio audioSwell audioPhrasePos
//@body
/**  The photo's colour calmed toward the colour family.
 *
 * @param photo  The photo's colour. (in)
 * @param fh     The family's hue. (in)
 *
 * @return
 *   The colour.
 **/
vec3 tone(vec3 photo, float fh)
{
    float l = luma(photo);
    return mix(photo * 1.1, famCol(fh, 0.15 + 0.7 * l) * (0.25 + 1.2 * l), 0.45);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float N = floor(3.0 + 3.0 * clamp(dropP, 0.0, 1.0));
    float mag = 0.5 + 0.35 * clamp(magP, 0.0, 1.0);
    float wob = 0.04 + 0.12 * clamp(audioSwell, 0.0, 1.0);
    float run = 0.03 * sceneTime + 0.12 * audioAdvance;
    vec2 delta = vec2(0.0);
    float rim = 0.0, dome = 0.0, hsum = 0.0;
    for (int i = 0; i < 6; ++i) {
        float fi = float(i);
        if (fi >= N) break;
        vec2 c = vec2(0.6 * sin(run * (0.4 + 0.1 * fi) + 2.1 * fi), 0.3 * cos(run * (0.33 + 0.12 * fi) + 1.3 * fi));
        float life = 0.5 + 0.5 * cos(6.2831853 * (audioPhrasePos + fi / N));
        float on = smoothstep(0.0, 0.5, life);
        float R = (0.28 + 0.14 * fract(fi * 0.618)) * (0.4 + 0.6 * on);
        vec2 d = p - c;
        float an = atan(d.y, d.x);
        float Rw = R * (1.0 + wob * (0.6 * sin(3.0 * an + 5.0 * run + fi) + 0.4 * sin(5.0 * an - 4.0 * run + 2.0 * fi)));
        float x = length(d) / Rw;
        if (x >= 1.0) continue;
        float hgt = (1.0 - x * x) * on;
        delta -= d * mag * hgt;                                       // drawn toward the middle: magnified
        hsum += hgt;
        rim += exp(-pow((x - 0.97) / 0.03, 2.0)) * on;
        dome += exp(-dot(d / R - vec2(-0.3, 0.35), d / R - vec2(-0.3, 0.35)) / 0.03) * on;
    }
    vec2 seen = p + delta;
    vec3 col = tone(imgLod(seen * 0.6 + 0.5, 0.5), fh) * (1.0 + 0.15 * hsum);
    col += famLight(fh, 0.6, 0.8) * (0.4 * rim + 0.35 * dome);
    finish(col);
}
