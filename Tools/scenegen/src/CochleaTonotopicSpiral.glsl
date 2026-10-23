//@doc
 * @brief COCHLEA TONOTOPIC SPIRAL: the snail of the ear: a logarithmic spiral on which every frequency has its place; the travelling wave runs in from the oval window and peaks where its frequency lies.  The photo lies in the turns, swirled into the spiral, and the wave lights four places
 * of the spiral (the places are fixed; only their strength follows the music).
 *
 * Audio Reactivity (structure, not only light):
 *   audioHigh, audioMid, audioBass, audioSubBass -> the strength of the four peaks along the spiral (places fixed, light only)
 *   audioAdvance -> the travelling wave runs in (integrated)
 *
 * Knobs: sizeP (the swirl of the photo), hueP.
//@params sizeP
//@audio audioHigh audioMid audioBass audioSubBass audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float r = length(p) + 1e-4;
    float th = atan(p.y, p.x);
    float sw = 1.2 + 1.8 * clamp(sizeP, 0.0, 1.0);
    vec3 c = imgLod(rot2(sw * (1.0 - 1.6 * r)) * p * 0.85 + 0.5, 0.6);
    float psi = th / 6.2831853 - 1.4 * log(r / 0.05);
    float s = clamp(log(r / 0.05) / log(10.0), 0.0, 1.2);
    float wave = 0.5 + 0.5 * cos(6.2831853 * (4.0 * psi - 0.04 * audioAdvance - 0.05 * sceneTime));
    float env = 0.0;
    env += clamp(audioHigh, 0.0, 1.0) * exp(-pow((s - 0.2) / 0.1, 2.0));
    env += clamp(audioMid, 0.0, 1.0) * exp(-pow((s - 0.45) / 0.1, 2.0));
    env += clamp(audioBass, 0.0, 1.0) * exp(-pow((s - 0.7) / 0.1, 2.0));
    env += clamp(audioSubBass, 0.0, 1.0) * exp(-pow((s - 0.92) / 0.1, 2.0));
    float arm = smoothstep(0.0, 0.1, fract(psi * 4.0)) * (1.0 - smoothstep(0.9, 1.0, fract(psi * 4.0)));
    float fade = smoothstep(0.03, 0.08, r);
    vec3 col = c * (0.45 + 0.25 * arm) + c * wave * env * 0.9 + vec3(0.9, 0.8, 0.6) * wave * env * 0.15;
    finish(col * fade * 1.15);
}
