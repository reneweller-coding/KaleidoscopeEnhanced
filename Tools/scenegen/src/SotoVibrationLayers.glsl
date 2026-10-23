//@doc
 * @brief SOTO VIBRATION LAYERS: several thin line gratings at different depths in front of the photo: as the parallax glides, the gratings slide over one another and the whole picture begins to vibrate with moire, as in Jesus Rafael Soto's
 * layered pieces.  The lines are fine, dark and slightly tinted by the photo; each grating is slanted a few degrees against the others.  The parallax runs with the drive of the music, the number of layers follows the spectral spread (each
 * layer fading in).
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the parallax glides (integrated)
 *   audioSpread     -> the number of layers (each fading in)
 *
 * Knobs: lineP (how fine the lines are), hueP.
//@params lineP
//@audio audioSpread
//@body
void main()
{
    vec2 p = screenP();
    vec3 c = imgLod(p * 0.8 + 0.5, 0.8);
    vec3 col = c * 1.15;
    float nl = 2.0 + 3.0 * clamp(audioSpread, 0.0, 1.0);
    float per = 0.011 + 0.014 * (1.0 - clamp(lineP, 0.0, 1.0));
    for (int i = 0; i < 5; ++i) {
        float fi = float(i);
        float depth = 0.25 + 0.2 * fi;
        float shift = depth * 0.22 * sin(0.05 * audioAdvance + 0.02 * sceneTime);
        float ang = 0.05 * (fi - 2.0);
        float x = dot(p, vec2(cos(ang), sin(ang))) + shift;
        float line = smoothstep(0.28, 0.5, abs(fract(x / (per * (1.0 + 0.12 * fi))) - 0.5));
        float w = clamp(nl - fi, 0.0, 1.0);
        col *= 1.0 - 0.6 * w * line;
    }
    finish(col);
}
