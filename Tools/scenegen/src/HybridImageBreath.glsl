//@doc
 * @brief HYBRID IMAGE BREATH: a hybrid image: the low frequencies of the first photo and the high frequencies of the second: from near you see the second, from far the first; the cut-off frequency breathes, the picture tips from
 * one to the other, and the coarse colours of the first photo are always the ground.  The cut-off follows the swell of the music and the breath's slow phase the drive.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the cut-off (a swell sharpens the second photo's detail)
 *   audioAdvance    -> the breath's slow phase (integrated)
 *
 * Knobs: gainP (how strong the second photo's detail is), hueP.
//@params gainP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float lodc = 1.5 + 2.5 * (0.5 + 0.5 * sin(0.03 * audioAdvance + 0.1 * sceneTime)) + 1.0 * (1.0 - clamp(audioSwell, 0.0, 1.0));
    vec3 lowA = imgLod(uv, lodc);
    vec3 highB = imgB(uv, 0.0) - imgB(uv, lodc);
    float g = 1.2 + 1.8 * clamp(gainP, 0.0, 1.0);
    finish(max(lowA + highB * g, 0.0) * 1.0);
}
