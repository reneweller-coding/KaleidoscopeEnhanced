//@doc
 * @brief HANGING BULB GRID: a grid of bare light bulbs hangs in the dark, row behind row into the distance, each on its
 * cord, and waves of brightness run through them in time with the beat; with every phrase the waves take another form.
 * The bulbs hang in rows across the view at their depths; a place on the screen tries the nearest bulb of every row,
 * drawn with a glowing filament and a soft glass halo.  A bulb's brightness is a wave of the beats counted in a small
 * field of the scene's own -- rings from the middle, a sweep across, or a diagonal -- cross-faded at the start of every
 * phrase.  The glow is warm shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBeatPhase -> waves of brightness run through the bulbs, one a beat (counted)
 *   audioPhrasePos -> every phrase the waves take another form (cross-faded at its start)
 *   audioSwell     -> the bulbs' glow
 *
 * Knobs: spacingP (the grid's spacing), dimP (how dark the resting bulbs are), hueP.
//@params spacingP dimP
//@audio audioBeatPhase audioPhrasePos audioSwell
//@state 1 1 60 32
//@body
/**  The state pass: the beats and the phrases counted.
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

/**  A wave's distance for a bulb, by the form.
 *
 * @param g     The bulb's place in the grid (column, row). (in)
 * @param kind  The form (0 rings, 1 a sweep, 2 a diagonal). (in)
 *
 * @return
 *   The distance in bulbs.
 **/
float waveD(vec2 g, float kind)
{
    float j = mod(kind, 3.0);
    return j < 0.5 ? length(g) : j < 1.5 ? g.x : 0.7 * (g.x + g.y);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float fh = famHue();
    const float F = 1.1, Y = 0.55;
    vec4 st = texelFetch(texState, ivec2(0, 0), 0);
    float dl = fract(clamp(audioBeatPhase, 0.0, 1.0) - st.y + 1.0);
    float beats = st.x + (dl < 0.5 ? dl : 0.0);                       // the count carried on to this frame
    float S = 0.45 + 0.25 * clamp(spacingP, 0.0, 1.0);
    float m = smoothstep(0.0, 0.08, clamp(audioPhrasePos, 0.0, 1.0));
    float rest = 0.04 + 0.12 * (1.0 - clamp(dimP, 0.0, 1.0));
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec3 warm = famLight(fh, 0.8, 0.45);
    vec3 col = famCol(fh, 0.3) * 0.015;
    for (int r = 11; r >= 0; --r) {
        float z = 1.0 + float(r) * S;
        float xw = p.x * z / F;
        float ci = floor(xw / S + 0.5);
        for (int dc = -1; dc <= 1; ++dc) {
            float c = ci + float(dc);
            float bob = 0.05 * sin(0.6 * sceneTime + 1.3 * c + 0.7 * float(r));
            float tier = mod(c + float(r), 3.0) - 1.0;                  // three heights, staggered
            vec3 b = vec3(c * S, 0.45 * tier * z * 0.35 + 0.1 * sin(0.9 * c + 1.7 * float(r)) + bob, z);
            vec2 sc = b.xy / b.z * F;
            float rs = 0.05 / b.z * F;
            float d = length(p - sc);
            vec2 g = vec2(c, float(r) - 5.0);
            float wA = pow(0.5 + 0.5 * cos(6.2831853 * (waveD(g, st.z - 1.0) / 4.0 - beats)), 4.0);
            float wB = pow(0.5 + 0.5 * cos(6.2831853 * (waveD(g, st.z) / 4.0 - beats)), 4.0);
            float lit = rest + (1.0 - rest) * mix(wA, wB, m);
            float fil = exp(-pow(d / (0.25 * rs), 2.0)) * 1.6;
            float glass = (1.0 - smoothstep(0.85 * rs, rs, d)) * 0.25 + exp(-d / (1.6 * rs)) * 0.35;
            float cord = exp(-pow((p.x - sc.x) / (0.6 / resolution.y + 0.002 / b.z), 2.0)) * step(sc.y + rs, p.y) * 0.06;
            col += warm * (fil + glass) * lit * glow * exp(-0.08 * b.z) + warm * cord * exp(-0.08 * b.z);
        }
    }
    finish(famExpose(col, 2.15, 0.70, 0.00, fh));
}
