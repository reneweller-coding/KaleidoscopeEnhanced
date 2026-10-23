//@doc
 * @brief VORTEX WINDOW DUET: a vortex that shows the second photo inside and the first outside, with a soft edge that rolls itself in as a spiral: the second photo is twisted round in the whirl, the edge winds up into arms; the vortex
 * wanders over the picture.  The strength of the whirl follows the swell, the path of the vortex the phase of the music.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the strength of the whirl
 *   audioPhase      -> the vortex wanders (integrated)
 *
 * Knobs: sizeP (the size of the vortex), hueP.
//@params sizeP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float t = 0.02 * sceneTime + 0.1 * audioPhase;
    vec2 ctr = vec2(0.45 * sin(t * 2.0), 0.18 * sin(t * 3.0 + 1.0));
    vec2 d = p - ctr;
    float r = length(d), ang = atan(d.y, d.x);
    float R0 = 0.2 + 0.2 * clamp(sizeP, 0.0, 1.0);
    float sw = 1.5 + 4.0 * clamp(audioSwell, 0.0, 1.0);
    float twist = sw * exp(-r / R0);
    float R = R0 * (1.0 + 0.3 * sin(3.0 * ang + 6.0 * r / R0 - 0.7 * sw));
    float inside = smoothstep(R + 0.03, R - 0.03, r);
    vec2 qb = ctr + rot2(twist) * d;
    vec3 b = imgB(qb * 0.8 + 0.5, 0.7);
    vec3 a = imgLod(uv, 0.7);
    finish(mix(a, b * 1.05, inside) * 1.03);
}
