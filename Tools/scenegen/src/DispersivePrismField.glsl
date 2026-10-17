//@doc
 * @brief DISPERSIVE PRISM FIELD: a field of turning glass prisms laid over the photo -- each cell a prism that
 * splits the light passing through it into a spectral fan, red bent least and violet most, so every edge of the
 * picture is drawn out into a little rainbow running in the prism's own direction.  The prisms turn slowly, each at
 * its own pace, and the fans sweep round.
 *
 * Audio Reactivity (structure, not only light):
 *   audioRolloff    -> the dispersion: bright music fans the colours wider (smoothed by the swell)
 *   audioPhase      -> the prisms turn (integrated)
 *   audioKick       -> the prisms' edges flash (light)
 *
 * Knobs: cellsP (prisms on screen), fanP (the base fan width), edgeP (how strongly the prism edges show), hueP.
//@params cellsP fanP edgeP
//@audio audioKick audioRolloff audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float cells = 2.0 + 4.0 * clamp(cellsP, 0.0, 1.0);
    // a triangular grid of prisms: skewed cells split along their diagonal
    vec2 g = p * cells;
    vec2 sk = vec2(g.x - g.y * 0.57735, g.y * 1.1547);
    vec2 id = floor(sk), f = fract(sk);
    float tri = f.x + f.y > 1.0 ? 1.0 : 0.0;
    vec2 cid = id * 2.0 + vec2(tri, 0.0);
    float h = hash21(cid + 0.3);
    float ang = 6.2831853 * h + (0.03 + 0.04 * h) * audioPhase + 0.1 * sceneTime * (h - 0.5);
    vec2 dir = vec2(cos(ang), sin(ang));
    float fan = (0.012 + 0.03 * clamp(fanP, 0.0, 1.0)) * (0.6 + 0.8 * clamp(audioRolloff, 0.0, 1.0) * clamp(audioSwell + 0.3, 0.0, 1.0));
    vec2 uv = p * 0.7 + 0.5;
    // seven wavelengths, each bent a little more, each read in its own colour
    vec3 col = vec3(0.0), wsum = vec3(0.0);
    for (int i = 0; i < 7; ++i) {
        float t = float(i) / 6.0;
        vec3 spec = clamp(vec3(1.5 - abs(t * 4.0 - 0.6), 1.5 - abs(t * 4.0 - 2.0), 1.5 - abs(t * 4.0 - 3.4)), 0.0, 1.0);
        vec3 c = imgLod(uv + dir * fan * (t - 0.5) * 6.0, 0.3);
        col += c * spec;
        wsum += spec;
    }
    col /= wsum;
    // the prism's faces: a soft edge along the cell's border
    float e = min(min(f.x, f.y), abs(1.0 - f.x - f.y));
    float edge = 1.0 - smoothstep(0.0, 0.05, e);
    vec3 tone = imgPalette(h + 0.03 * audioPhase);
    col *= 0.9 + 0.2 * h;
    col *= 1.0 - 0.35 * edge;
    col += mix(tone, vec3(1.0), 0.5) * edge * (0.2 + 0.5 * clamp(edgeP, 0.0, 1.0)) * (0.5 + clamp(audioKick, 0.0, 1.0));
    finish(col);
}
