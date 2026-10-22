//@doc
 * @brief APOLLONIAN GLOW WEB: an Apollonian-like inversion fractal -- the plane folded into a cell and inverted in the
 * unit circle again and again -- of which only the veins glow: the arcs where the folded point crosses the cell's
 * middle line, a web of light threads that meet at the circles' points of contact; the circles themselves stay
 * dark.  The scale gathered by the inversions turns the fold distance into a true distance, so every vein is equally
 * fine.  One colour family from the photo; deeper veins a paler shade.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the starting circles turn and the web drifts (integrated)
 *   audioOnset   -> light runs through the web, one depth after the other
 *   audioSwell   -> the inversion's strength: the web's meshes open and close
 *
 * Knobs: meshP (the inversion's base strength), veinP (the veins' width), hueP.  Distinct from the Apollonian scenes,
 * which show the spheres.
//@params meshP veinP
//@audio audioOnset audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float k0 = 1.08 + 0.12 * clamp(meshP, 0.0, 1.0) + 0.06 * clamp(audioSwell, 0.0, 1.0);
    float vein = 1.0 + 1.5 * clamp(veinP, 0.0, 1.0);
    float turn = 0.03 * sceneTime + 0.15 * audioAdvance;
    float drift = 0.02 * sceneTime + 0.08 * audioAdvance;
    float onset = clamp(audioOnset, 0.0, 1.0);
    vec2 z = rot2(turn) * (p * 2.4) + vec2(0.7 * sin(drift), 0.5 * cos(0.8 * drift));
    float scale = 1.0;
    vec3 col = vec3(0.0);
    float px = 2.4 / resolution.y;
    float dCoarse = 1e9;
    for (int i = 0; i < 9; ++i) {
        z = -1.0 + 2.0 * fract(0.5 * z + 0.5);
        float r2 = max(dot(z, z), 1e-6);
        float k = k0 / r2;
        z *= k;
        scale *= k;
        if (i == 3) dCoarse = 0.25 * abs(z.y) / scale;
    }
    // the veins: where the folded point crosses the middle line -- the finest set, and a coarser one beneath
    float d = 0.25 * abs(z.y) / scale;
    float g = exp(-pow(d / (px * vein), 2.0)) + 0.1 * exp(-d / (px * 6.0));
    float gc = exp(-pow(dCoarse / (px * vein * 2.5), 2.0));
    float run = 1.0 + 1.5 * onset * (0.5 + 0.5 * cos(6.2831853 * (log(scale) * 0.3 - 0.7 * audioAdvance)));
    float depth = log(max(scale, 1.0));                          // dense regions sit deep: dim them, shade them
    col += famLight(fh, fract(0.08 * depth), 0.3 * g) * g * run * 0.75 / (1.0 + 0.12 * depth)
           + famLight(fh, 0.3, 0.1) * gc * 0.35;
    col += famCol(fh, 0.5) * 0.012;
    finish(col);
}
