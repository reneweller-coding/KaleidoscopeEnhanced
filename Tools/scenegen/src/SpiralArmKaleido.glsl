//@doc
 * @brief SPIRAL ARM KALEIDO: a kaleidoscope whose mirrors are logarithmic spirals instead of straight lines: the
 * rosette's petals curl round the centre and the whole figure turns into itself without end.  In log-polar
 * coordinates (log r, angle) a logarithmic spiral is a straight line, so shearing the angle by the pitch times log r
 * turns the spiral mirrors into radial ones, where the usual mirror fold applies; turning the figure is a shift of
 * the angle, sinking into it a shift of log r (both seamless).  The photo's own colours, calmed toward one colour
 * family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the spirals' pitch glides with the chord changes: the arms curl tighter or open
 *   audioAdvance     -> the figure turns into itself (integrated)
 *   audioSwell       -> the arms' seams glow
 *
 * Knobs: armP (the number of mirrors), sinkP (how fast the figure sinks inward), hueP.
//@params armP sinkP
//@audio audioHarmAdvance audioSwell
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
    float h = max(audioHarmAdvance, 0.0);
    float arms = floor(5.0 + 5.0 * clamp(armP, 0.0, 1.0));
    float pitch = 0.9 + 0.5 * sin(0.6 * h) + 0.2 * sin(0.27 * h + 1.0);
    float turn = 0.03 * sceneTime + 0.15 * audioAdvance;
    float sink = (0.02 + 0.04 * clamp(sinkP, 0.0, 1.0)) * sceneTime + 0.1 * audioAdvance;
    float r = max(length(p), 1e-4);
    float u = log(r) + sink;
    float v = atan(p.y, p.x) - pitch * log(r) + turn;          // the shear: spirals become radial lines
    float sec = 6.2831853 / arms;
    float a = abs(mod(v, sec) - 0.5 * sec);                      // the mirror fold between two spiral arms
    // the content in (log r, folded angle): rings periodic in log r (mirrored, so the sinking has no seam)
    float ring = abs(fract(u * 0.7) * 2.0 - 1.0);
    vec2 uv = vec2(0.15 + 0.7 * ring, 0.15 + 0.7 * a / (0.5 * sec));
    vec3 col = tone(imgLod(uv, 0.7), fh);
    float seam = min(a, 0.5 * sec - a) * r;
    col += famLight(fh, 0.6, 0.6) * exp(-seam / 0.004) * (0.1 + 0.35 * clamp(audioSwell, 0.0, 1.0));
    col *= smoothstep(0.0, 0.05, r);
    finish(col);
}
