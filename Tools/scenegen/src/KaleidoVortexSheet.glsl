//@doc
 * @brief KALEIDO VORTEX SHEET: a kaleidoscopic photo surface caught in a shear layer: the layer rolls up into a row
 * of vortices (Kelvin-Helmholtz billows), winding the rosettes into spirals that unwind again as the roll-up eases,
 * three such layers stacked over the frame.  Each layer's flow is a sum of point vortices along its line, their
 * swirl falling off with distance, applied as a displacement to the kaleidoscope's coordinates (traced back along
 * the swirl); the billows drift along the layer.  The photo's own colours, calmed toward one colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the roll-up: the vortices wind tighter
 *   audioAdvance -> the billows drift along the layers (integrated)
 *
 * Knobs: sidesP (the rosettes' symmetry), billowP (how many billows per layer), hueP.
//@params sidesP billowP
//@audio audioSwell
//@body
/**  The dihedral fold: a direction folded into one mirror sector of the given count.
 *
 * @param d      The point (centre at 0). (in)
 * @param sides  The number of mirrors. (in)
 *
 * @return
 *   The folded point.
 **/
vec2 kfold(vec2 d, float sides)
{
    float sec = 6.2831853 / sides;
    float a = abs(mod(atan(d.y, d.x), sec) - 0.5 * sec);
    return length(d) * vec2(cos(a), sin(a));
}

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
    float sides = floor(6.0 + 4.0 * clamp(sidesP, 0.0, 1.0));
    float billows = 3.0 + 3.0 * clamp(billowP, 0.0, 1.0);
    float roll = 1.5 + 4.5 * clamp(audioSwell, 0.0, 1.0);
    float drift = 0.03 * sceneTime + 0.12 * audioAdvance;
    // the swirl: each billow turns the point about its centre by an angle falling off with the distance
    vec2 q = p;
    for (int layer = 0; layer < 3; ++layer) {
        float y0 = -0.32 + 0.32 * float(layer);
        float dirL = mod(float(layer), 2.0) > 0.5 ? -1.0 : 1.0;
        float sp = 1.8 / billows;
        float cx = (floor((q.x / sp) - dirL * drift / sp + 0.5) + dirL * drift / sp) * sp;
        for (int k = -1; k <= 1; ++k) {
            vec2 c = vec2(cx + float(k) * sp, y0);
            vec2 d = q - c;
            float r2 = dot(d, d);
            float ang = roll * exp(-r2 / (0.12 * sp * sp)) * dirL;
            q = c + rot2(ang) * d;
        }
    }
    vec2 k2 = kfold(rot2(0.02 * sceneTime) * q, sides);
    vec3 col = tone(imgLod(k2 * 0.45 + vec2(0.5, 0.45), 0.6), fh);
    finish(col);
}
