//@doc
 * @brief OUCHI FLOAT: the Ouchi illusion: a disc of upright bars lies in a ground of horizontal bars (both checkerboards of long rectangles) and swims free of the picture as soon as the eye moves; the bars are cut from the photo,
 * dark and bright parts of its own colour.  The disc wanders over the picture with the melody (the melody's pitch, smoothed in a small field of the scene's own, lifts and lowers its path) and the number of bars follows the
 * spectral spread.
 *
 * Audio Reactivity (structure, not only light):
 *   audioMelodyPitch -> the disc's path rises and falls (smoothed, never a jump)
 *   audioSpread     -> the number of bars
 *   audioAdvance    -> the disc wanders (integrated)
 *
 * Knobs: barP (the bars' size), hueP.
//@params barP
//@audio audioMelodyPitch audioSpread
//@state 1 1 30 32
//@body
/**  The state pass: the melody's pitch, smoothed over a second or two.
 *
 * @return
 *   x the smoothed pitch, 0, 0, 1.
 **/
vec4 stateStep()
{
    float old = stateFrame < 0.5 ? clamp(audioMelodyPitch, 0.0, 1.0) : texelFetch(texState, ivec2(0, 0), 0).x;
    return vec4(old + (clamp(audioMelodyPitch, 0.0, 1.0) - old) * 0.02, 0.0, 0.0, 1.0);
}
void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float t = sceneTime;
    vec4 st = texelFetch(texState, ivec2(0, 0), 0);
    vec2 ctr = vec2(0.34 * sin(0.05 * t + 0.15 * audioAdvance), 0.1 * cos(0.04 * t + 0.1 * audioAdvance) + 0.3 * (st.x - 0.5));
    float Nb = (7.0 + 10.0 * (1.0 - clamp(barP, 0.0, 1.0))) * (0.8 + 0.5 * clamp(audioSpread, 0.0, 1.0));
    float disc = smoothstep(0.015, -0.015, length((p - ctr) * vec2(1.0, 1.1)) - 0.27);
    vec2 qh = vec2(p.x * Nb * 0.45, p.y * Nb * 1.8);
    vec2 qv = vec2(p.x * Nb * 1.8, p.y * Nb * 0.45);
    float th = mod(floor(qh.x) + floor(qh.y), 2.0);
    float tv = mod(floor(qv.x) + floor(qv.y), 2.0);
    float tone = mix(th, tv, disc);
    vec3 c = imgLod(p * 0.8 + 0.5, 1.5);
    finish(c * mix(0.14, 1.2, tone));
}
