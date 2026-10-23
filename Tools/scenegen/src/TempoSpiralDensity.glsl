//@doc
 * @brief TEMPO SPIRAL DENSITY: a spiral whose number of arms follows the tempo: the faster the music, the more arms, and the change is a cross-over between a spiral of n arms and one of n + 1, never a jump; every arm carries the photo
 * at its own scale.  The tempo is measured from the beats in a small field of the scene's own (the time between beat wraps, smoothed); the spiral turns slowly with the drive of the music.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBeatPhase  -> the tempo (measured over the beats, smoothed): from three arms at a slow tempo to twelve at a fast one
 *   audioAdvance    -> the spiral turns (integrated)
 *
 * Knobs: wrapP (how tightly the spiral winds), hueP.
//@params wrapP
//@audio audioSwell
//@state 1 1 30 32
//@body
/**  The state pass: the tempo in beats a second (x), the last beat phase (y) and the steps since the last beat (z).
 *
 * @return
 *   The state.
 **/
vec4 stateStep()
{
    float bp = rhyBeat();
    if (stateFrame < 0.5) return vec4(0.0, bp, 0.0, 1.0);
    vec4 old = texelFetch(texState, ivec2(0, 0), 0);
    float steps = old.z + 1.0;
    float tempo = old.x;
    if (bp < old.y - 0.5) {
        float bps = 30.0 / steps;
        if (bps > 1.0 && bps < 4.0) tempo = tempo < 0.1 ? bps : mix(tempo, bps, 0.25);
        steps = 0.0;
    }
    return vec4(tempo, bp, steps, 1.0);
}
/**  A spiral of n arms, the photo in every arm.
 *
 * @param p     The pixel. (in)
 * @param n     The number of arms. (in)
 * @param spin  The turn. (in)
 * @param wr    The winding. (in)
 *
 * @return
 *   The colour.
 **/
vec3 armSpiral(vec2 p, float n, float spin, float wr)
{
    float r = length(p) + 0.001, a = atan(p.y, p.x);
    float s = ((a + 3.1415927) / 6.2831853 + wr * log(r + 0.05) - spin) * n;
    float fa = fract(s);
    float arm = mod(floor(s), n);
    float body = smoothstep(0.0, 0.1, fa) * smoothstep(1.0, 0.9, fa);
    float z = 0.6 + 0.9 * hash21(vec2(arm, n));
    vec3 c = imgLod(p * z * 0.8 + 0.5 + 0.1 * vec2(sin(arm), cos(arm)), 0.6);
    return c * (0.25 + 0.85 * body);
}
void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    vec4 st = texelFetch(texState, ivec2(0, 0), 0);
    float bpm = st.x > 0.1 ? st.x * 60.0 : 120.0;
    float arms = 3.0 + 9.0 * clamp((bpm - 70.0) / 100.0, 0.0, 0.999);
    float n0 = floor(arms);
    float spin = 0.03 * audioAdvance + 0.01 * sceneTime;
    float wr = 0.2 + 0.5 * clamp(wrapP, 0.0, 1.0);
    vec3 col = mix(armSpiral(p, n0, spin, wr), armSpiral(p, n0 + 1.0, spin, wr), smoothstep(0.0, 1.0, fract(arms)));
    finish(col * (0.95 + 0.2 * clamp(audioSwell, 0.0, 1.0)) * 1.1);
}
