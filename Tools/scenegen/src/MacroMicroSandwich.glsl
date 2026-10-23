//@doc
 * @brief MACRO MICRO SANDWICH: the coarsest level of the photo fills the screen as clouds of colour, and the finest level lies
 * over it at another scale and angle: the clouds breathe and the detail moves between them, so that the structure of the
 * photo is pulled apart into its two ends.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the scale ratio of the detail to the clouds breathes with it
 *   audioPhase      -> the detail's angle (integrated)
 *   audioAdvance    -> the clouds' drift (integrated)
 *
 * Knobs: ratioP (the base scale ratio), detailP (how strongly the detail shows), hueP.
//@params ratioP detailP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float t = sceneTime * 0.4 + 2.0 * audioAdvance;
    float sw = clamp(audioSwell, 0.0, 1.0);
    vec2 uvC = p * 0.8 + 0.5 + 0.08 * vec2(sin(0.1 * t), cos(0.13 * t));
    float s2 = 1.6 + 2.0 * clamp(ratioP, 0.0, 1.0) + 0.8 * sw;
    float a = 0.35 + 0.05 * audioPhase + 0.04 * sceneTime;
    vec2 uvF = rot2(a) * p * 0.8 * s2 + 0.5;
    vec3 coarse = imgLod(uvC, 5.5);
    vec3 fine = imgLod(uvF, 0.0) - imgLod(uvF, 2.5);
    vec3 col = coarse * 1.1 + fine * (3.0 + 3.0 * clamp(detailP, 0.0, 1.0));
    finish(col);
}
