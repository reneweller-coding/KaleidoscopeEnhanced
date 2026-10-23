//@doc
 * @brief VELVET NAP SWEEP: velvet: a stroke of the hand turns the pile into streaks, and the photo brightens and darkens where the fibres lie
 * against or with the light; the streaks wander across the picture.  The colours are the photo's; the pile changes only the sheen.
 *
 * Audio Reactivity (structure, not only light):
 *   audioMelodyPitch -> the streaks' angle follows the melody (smoothed)
 *   audioSwell      -> the streaks' width and contrast
 *   audioPhase      -> the hand's stroke moves across (integrated)
 *
 * Knobs: strokeP (the stroke's width), sheenP (the pile's sheen), hueP.
//@params strokeP sheenP
//@audio audioSwell audioMelodyPitch
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float t = sceneTime * 0.2 + 1.5 * audioPhase;
    float a = 1.3 * sin(2.0 * p.x + 0.3 * t) + 1.1 * sin(2.5 * p.y - 0.2 * t + 1.0) + 2.0 * (noise2(p * 3.0 + 0.05 * t) - 0.5);
    vec2 c = 0.7 * vec2(sin(0.17 * t), cos(0.13 * t));
    vec2 dir = vec2(cos(0.6 + 0.3 * sin(0.1 * t)), sin(0.6 + 0.3 * sin(0.1 * t)));
    float w = 0.12 + 0.3 * clamp(strokeP, 0.0, 1.0) + 0.1 * clamp(audioSwell, 0.0, 1.0);
    float stroke = smoothstep(w, 0.0, abs(dot(p - c, vec2(-dir.y, dir.x))));
    float napA = a + 1.1 * stroke + 0.6 * clamp(audioMelodyPitch, 0.0, 1.0);
    float sheen = pow(abs(sin(napA - 0.4)), 2.0);
    float amt = 0.5 + 0.8 * clamp(sheenP, 0.0, 1.0) * (0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0));
    vec3 col = imgLod(uv, 0.5) * (0.5 + amt * sheen);
    finish(col * 1.05);
}
