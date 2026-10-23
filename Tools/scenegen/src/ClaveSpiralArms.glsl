//@doc
 * @brief CLAVE SPIRAL ARMS: a spiral of sixteen arms, of which five carry the hits of the son clave -- steps one, four, seven, eleven and thirteen of the bar's sixteen -- and show the photo; each arm lights up as its step comes round
 * and then shows the photo larger; the others are only dim ghost arms.  The spiral turns slowly with the drive of the music.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBarPhase   -> the sixteen steps of the bar: each hit arm glows on its step and fades behind it
 *   audioAdvance    -> the spiral turns (integrated)
 *   audioSwell      -> the arms' width
 *
 * Knobs: wrapP (how tightly the spiral winds), hueP.
//@params wrapP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float r = length(p) + 0.001, a = atan(p.y, p.x);
    float spin = 0.04 * audioAdvance + 0.01 * sceneTime;
    float wr = 0.25 + 0.5 * clamp(wrapP, 0.0, 1.0);
    float s = ((a + 3.1415927) / 6.2831853 + wr * log(r + 0.06) - spin) * 16.0;
    float s16 = mod(s, 16.0);
    float arm = floor(s16);
    float f = fract(s16);
    float step16 = rhyBar() * 16.0;
    float hit = (arm < 0.5 || (arm > 2.5 && arm < 3.5) || (arm > 5.5 && arm < 6.5) || (arm > 9.5 && arm < 10.5) || (arm > 11.5 && arm < 12.5)) ? 1.0 : 0.0;
    float dl = mod(step16 - arm - 0.5 + 8.0, 16.0) - 8.0;
    float glow = exp(-max(dl, 0.0) * 0.5 + min(dl, 0.0) * 2.5);
    float wid = 0.3 + 0.2 * clamp(audioSwell, 0.0, 1.0) + 0.25 * glow * hit;
    float body = smoothstep(wid, wid - 0.08, abs(f - 0.5));
    float zoom = 0.7 + 0.8 * glow;
    vec3 c = imgLod(p * 0.8 * zoom + 0.5 + vec2(0.05 * sin(arm), 0.05 * cos(1.7 * arm)), 0.6);
    vec3 ghost = imgLod(p * 0.8 + 0.5, 1.5) * 0.4;
    vec3 col = mix(ghost * mix(0.5, 1.2, body), c * (0.65 + 1.0 * glow), body * hit);
    finish(col * 1.1);
}
