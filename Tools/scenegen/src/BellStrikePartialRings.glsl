//@doc
 * @brief BELL STRIKE PARTIAL RINGS: a bell: on striking, prime, tierce, fifth and nominal sound with their own decay times; in the picture rings of the photo arise that swing in four modes, where the tierce forces the rings into a second symmetry.  Each partial is a ring pattern with its own angular
 * count (2, 3, 4, 5) whose strength follows one band of the spectrum, and the photo is shifted by the sum.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSubBass, audioBass, audioMid, audioHigh -> the strength of the four partials (amplitudes only)
 *   audioRolloff -> the decay (how long the higher partials stand)
 *
 * Knobs: sizeP (the ring spacing), hueP.
//@params sizeP
//@audio audioSubBass audioBass audioMid audioHigh audioRolloff
//@body
void main()
{
    vec2 p = screenP();
    float r = length(p) + 1e-4;
    float th = atan(p.y, p.x);
    float sp = 5.0 + 5.0 * (1.0 - clamp(sizeP, 0.0, 1.0));
    float t = sceneTime;
    float rolloff = 0.4 + 0.6 * clamp(audioRolloff, 0.0, 1.0);
    float a0 = 0.4 + 0.6 * clamp(audioSubBass, 0.0, 1.0);
    float a1 = 0.4 + 0.6 * clamp(audioBass, 0.0, 1.0);
    float a2 = (0.3 + 0.7 * clamp(audioMid, 0.0, 1.0)) * rolloff;
    float a3 = (0.3 + 0.7 * clamp(audioHigh, 0.0, 1.0)) * rolloff * rolloff;
    float w0 = a0 * cos(sp * 1.0 * r * 6.2831853 - 0.7 * t) * cos(2.0 * th + 0.1 * t);
    float w1 = a1 * cos(sp * 1.2 * r * 6.2831853 - 0.9 * t) * cos(3.0 * th - 0.12 * t);
    float w2 = a2 * cos(sp * 1.5 * r * 6.2831853 - 1.2 * t) * cos(4.0 * th + 0.14 * t);
    float w3 = a3 * cos(sp * 2.0 * r * 6.2831853 - 1.6 * t) * cos(5.0 * th - 0.16 * t);
    float w = (w0 + w1 + w2 + w3) * 0.25;
    vec2 dir = p / r;
    vec2 uv = p * 0.85 + 0.5 + 0.03 * w * dir;
    vec3 c = imgLod(uv, 0.5);
    float ring = smoothstep(0.35, 0.0, abs(w)) * 0.35;
    vec3 col = c * (0.7 + 0.6 * w) + vec3(0.9, 0.75, 0.4) * ring * exp(-r * 2.0);
    finish(col * 1.1);
}
