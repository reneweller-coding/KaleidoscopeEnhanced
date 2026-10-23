//@doc
 * @brief EXCITABLE PHOTO REFRACTION: excitation waves in a medium of varying excitability: the photo sets the thresholds, the dark places need more to be set off, so that the waves bend away from the dark and slow before it, run fast
 * through the bright and leave the picture ringing; a FitzHugh-Nagumo medium calculated in a small field of the scene's own.  Four fixed points fire in turn through the bar, each once -- the waves are set off by the beat of the
 * music.  The medium wears the photo's colours, brightened where it is excited.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBarPhase   -> the four points fire in turn, once each in a bar
 *   audioSwell      -> the strength of the excitation
 *
 * Knobs: thresholdP (how strongly the photo sets the thresholds), hueP.
//@params thresholdP
//@audio audioSwell
//@state 320 180 240 32
//@body
/**  The photo coordinate of a field cell.
 *
 * @param c  The cell coordinate. (in)
 *
 * @return
 *   The photo coordinate.
 **/
vec2 photoUV(vec2 c) { return ((c / stateRes) - 0.5) * vec2(1.7778, 1.0) * 0.8 + 0.5; }
/**  One step of the FitzHugh-Nagumo medium with the thresholds set by the photo (the state pass).
 *
 * @return
 *   u, w, 0, 1.
 **/
vec4 stateStep()
{
    ivec2 ip = stCell();
    if (stateFrame < 0.5) return vec4(0.0, 0.0, 0.0, 1.0);
    vec4 c = stAt(ip);
    float lap = stAt(ip + ivec2(1, 0)).r + stAt(ip - ivec2(1, 0)).r + stAt(ip + ivec2(0, 1)).r + stAt(ip - ivec2(0, 1)).r - 4.0 * c.r;
    float l = luma(imgLod(photoUV(vec2(ip) + 0.5), 2.0));
    float a = 0.06 + (0.04 + 0.2 * clamp(thresholdP, 0.0, 1.0)) * (1.0 - l);
    float u = c.r, w = c.g;
    float dt = 0.2;
    float un = u + dt * (1.0 * lap + u * (u - a) * (1.0 - u) * 3.0 - w);
    float wn = w + dt * 0.12 * (u - 1.6 * w);
    float bar = rhyBar();
    float slot = floor(bar * 4.0);
    float within = fract(bar * 4.0);
    if (within < 0.08) {
        vec2 at = stateRes * (0.2 + 0.6 * vec2(hash11(slot * 1.7 + 0.4), hash11(slot * 3.1 + 2.2)));
        vec2 d = vec2(ip) + 0.5 - at;
        un += (0.6 + 0.4 * clamp(audioSwell, 0.0, 1.0)) * exp(-dot(d, d) / 22.0) * smoothstep(0.0, 0.03, within) * smoothstep(0.08, 0.05, within);
    }
    return vec4(clamp(un, -0.3, 1.3), clamp(wn, -0.3, 1.0), 0.0, 1.0);
}
void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    vec2 cc = (p / vec2(asp, 1.0) + 0.5) * stateRes;
    float u = stLin(cc).r;
    vec2 g = vec2(stLin(cc + vec2(1.5, 0.0)).r - stLin(cc - vec2(1.5, 0.0)).r, stLin(cc + vec2(0.0, 1.5)).r - stLin(cc - vec2(0.0, 1.5)).r);
    vec3 c = imgLod(p * 0.8 + 0.5 + g * 0.02, 0.7);
    float ex = smoothstep(0.1, 0.8, u);
    finish(c * (0.5 + 0.9 * ex) + 0.35 * ex * mix(c, vec3(1.0), 0.5));
}
