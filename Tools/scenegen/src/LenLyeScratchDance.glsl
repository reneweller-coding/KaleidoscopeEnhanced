//@doc
 * @brief LEN LYE SCRATCH DANCE: after Len Lye's "Free Radicals": white lines scratched into black film fill the frame
 * as a field -- jagged, flickering strokes -- that sway and dance with the music; unlike the original's frame jumps
 * they swing smoothly.  Each scratch is a vertical line with its own jagged course (a sum of a few sines), swaying
 * sideways; loud music brings more of them out of the black.  The white is tinted toward the photo's colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioOnset   -> the swing's width: onsets set the lines dancing (an envelope, so the swing is smooth)
 *   audioLevel   -> the density: louder music, more lines
 *   audioAdvance -> the swing's phase and the scratches' slow drift (integrated)
 *
 * Knobs: lineP (the base number of lines), jagP (how jagged the lines are), hueP.
//@params lineP jagP
//@audio audioOnset audioLevel
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float n = floor(24.0 + 24.0 * clamp(lineP, 0.0, 1.0));
    float jag = 0.3 + 0.7 * clamp(jagP, 0.0, 1.0);
    float swing = 0.02 + 0.1 * clamp(audioOnset, 0.0, 1.0);
    float ph = 0.6 * sceneTime + 2.5 * audioAdvance;
    float dens = 0.35 + 0.6 * clamp(audioLevel, 0.0, 1.0);
    float S = 1.8 / n;
    float c0 = floor((p.x + 0.9) / S);
    vec3 col = vec3(0.0);
    for (int k = -3; k <= 3; ++k) {
        float c = c0 + float(k);
        float hc = fract(sin(c * 12.9898) * 43758.5453);
        if (hc > dens) continue;
        float x0 = (c + 0.5) * S - 0.9;
        float y = p.y;
        float x = x0 + swing * sin(ph * (0.6 + 0.8 * hc) + 6.2831853 * hc)
                  + jag * 0.03 * (sin(17.0 * y + 9.0 * hc) + 0.6 * sin(41.0 * y + 3.0 * hc + 0.4 * ph) + 0.3 * sin(97.0 * y + hc * 20.0));
        float len = smoothstep(0.0, 0.05, fract(y * 0.6 + hc + 0.03 * ph)) * step(fract(y * 0.6 + hc + 0.03 * ph), 0.7 + 0.3 * hc);
        float w = 0.0025 + 0.003 * fract(hc * 7.3);
        float line = exp(-pow((p.x - x) / w, 2.0)) * len;
        col += famLight(fh, fract(hc * 3.1), 0.85) * line * (0.6 + 0.6 * fract(hc * 5.7));
    }
    // the film's grain
    col += famCol(fh, 0.5) * 0.02 * hash21(floor(p * 300.0) + floor(0.5 * sceneTime));
    finish(col);
}
