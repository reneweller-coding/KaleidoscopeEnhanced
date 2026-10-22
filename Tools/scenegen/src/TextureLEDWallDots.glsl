//@doc
 * @brief TEXTURE LED WALL DOTS: a giant wall of round LED dots shows the photo, waves of brightness run across it in
 * time with the beat, and beams of light shine out of the rig above it through the haze, brighter as the music swells.
 * The dots sit on a square grid, each the photo's colour at its middle, round with a soft glow; the waves are rings
 * from a point that wanders slowly, one ring a beat (the beats counted in a small field of the scene's own); their form
 * -- rings, sweeps, a diamond -- changes with every phrase, cross-faded.  The beams fan down from the top through the
 * haze.  The dots are the photo, calmed toward one colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBeatPhase -> waves run across the wall, one a beat (counted)
 *   audioPhrasePos -> every phrase the waves take another form (cross-faded at the phrase's start)
 *   audioSwell     -> the beams' brightness
 *
 * Knobs: dotP (the dots' size), beamP (how many beams), hueP.
//@params dotP beamP
//@audio audioBeatPhase audioPhrasePos audioSwell
//@state 1 1 60 32
//@body
/**  The state pass: the beats counted by summing the beat phase's steps, and the phrases counted.
 *
 * @return
 *   x the beats so far, y the last beat phase, z the phrases so far, w the last phrase position.
 **/
vec4 stateStep()
{
    float bp = clamp(audioBeatPhase, 0.0, 1.0), pp = clamp(audioPhrasePos, 0.0, 1.0);
    if (stateFrame < 0.5) return vec4(0.0, bp, 0.0, pp);
    vec4 old = texelFetch(texState, ivec2(0, 0), 0);
    float d = fract(bp - old.y + 1.0);
    if (d > 0.5) d = 0.0;
    float ph = old.z + (pp < old.w - 0.5 ? 1.0 : 0.0);
    return vec4(mod(old.x + d, 4096.0), bp, mod(ph, 4096.0), pp);
}

/**  The photo's colour calmed toward the colour family.
 *
 * @param photo  The photo's colour. (in)
 * @param fh     The family's hue. (in)
 *
 * @return
 *   The colour.
 **/
vec3 tone(vec3 photo, float fh)
{
    float l = luma(photo);
    return mix(photo * 1.1, famCol(fh, 0.15 + 0.7 * l) * (0.25 + 1.2 * l), 0.45);
}

/**  A wave's form: how far a dot lies from the wave's start.
 *
 * @param q     The dot's place. (in)
 * @param o     The waves' origin. (in)
 * @param kind  The form (0 rings, 1 a sweep, 2 a diamond). (in)
 *
 * @return
 *   The distance.
 **/
float waveDist(vec2 q, vec2 o, float kind)
{
    vec2 d = q - o;
    float j = mod(kind, 3.0);
    return j < 0.5 ? length(d) : j < 1.5 ? d.x * 0.8 + d.y * 0.6 : abs(d.x) + abs(d.y);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float fh = famHue();
    vec4 st = texelFetch(texState, ivec2(0, 0), 0);
    float dl = fract(clamp(audioBeatPhase, 0.0, 1.0) - st.y + 1.0);
    float beats = st.x + (dl < 0.5 ? dl : 0.0);                       // the count carried on to this frame
    float pitch = 1.0 / (60.0 - 25.0 * clamp(dotP, 0.0, 1.0));       // the dots' spacing
    vec2 g = p / pitch;
    vec2 cell = floor(g) + 0.5;
    vec2 l = g - cell;
    vec2 q = cell * pitch;
    vec3 led = tone(imgLod(vec2(0.5) + q * vec2(0.5, 0.9), 1.0), fh);
    vec2 o = vec2(0.4 * sin(0.05 * sceneTime), 0.2 * cos(0.04 * sceneTime));
    float m = smoothstep(0.0, 0.08, clamp(audioPhrasePos, 0.0, 1.0));
    float dA = waveDist(q, o, st.z - 1.0), dB = waveDist(q, o, st.z);
    float wA = pow(0.5 + 0.5 * cos(6.2831853 * (dA / 0.35 - beats)), 3.0), wB = pow(0.5 + 0.5 * cos(6.2831853 * (dB / 0.35 - beats)), 3.0);
    float wave = mix(wA, wB, m);
    float rr = length(l);
    float px = 1.0 / (pitch * resolution.y);
    float dotm = 1.0 - smoothstep(0.32 - px, 0.32 + px, rr);
    vec3 col = led * (0.3 + 0.9 * wave) * (dotm + 0.18 * exp(-rr * 5.0));
    // the beams from the rig above, fanning down through the haze
    float nb = floor(5.0 + 6.0 * clamp(beamP, 0.0, 1.0));
    float glow = 0.4 + 0.8 * clamp(audioSwell, 0.0, 1.0);
    vec2 src = vec2(0.0, 0.75);
    float an = atan(p.x - src.x, src.y - p.y);
    float fan = 0.0;
    for (int b = 0; b < 11; ++b) {
        float fb = float(b);
        if (fb >= nb) break;
        float aim = (fb / max(nb - 1.0, 1.0) - 0.5) * 1.4 + 0.25 * sin(0.3 * sceneTime + fb);
        fan += exp(-pow((an - aim) / 0.025, 2.0));
    }
    col += famLight(fh, 0.6, 0.6) * fan * 0.25 * glow * smoothstep(1.4, 0.2, length(p - src));
    finish(col);
}
