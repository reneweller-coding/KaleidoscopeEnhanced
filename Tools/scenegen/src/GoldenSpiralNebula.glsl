//@doc
 * @brief GOLDEN SPIRAL NEBULA: spirals of light-dust nested into the depth -- golden logarithmic spirals, r growing by
 * phi every quarter turn, several arms turning one way and finer ones the other -- and the eye sinks along them
 * without end.  Drawn in log-polar coordinates (log r, angle), where a logarithmic spiral is a straight line and
 * sinking is a shift: the zoom never needs to wrap.  The dust is round grains on a lattice in those coordinates;
 * the map is conformal, so the grains stay round on screen and grow with the radius.  One colour family from the
 * photo, a shade per family of arms.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the spirals' pitch wavers round the golden one with the chord changes
 *   audioAdvance     -> the sinking along the arms (integrated)
 *   audioSwell       -> how much dust the arms carry
 *
 * Knobs: armP (how many arms), grainP (the dust's size), hueP.
//@params armP grainP
//@audio audioHarmAdvance audioSwell
//@body
/**  One family of spiral arms of dust in log-polar coordinates.
 *
 * @param lp     (log r, angle). (in)
 * @param arms   How many arms. (in)
 * @param pitch  log r gained per radian. (in)
 * @param shift  The sinking (log r). (in)
 * @param grain  The grains' size (in log units). (in)
 * @param dust   How much dust. (in)
 * @param seed   The family's own offset. (in)
 *
 * @return
 *   The light.
 **/
float spiralDust(vec2 lp, float arms, float pitch, float shift, float grain, float dust, float seed)
{
    // across the arms: the phase of the line u - pitch * angle, repeated per arm
    float across = (lp.x + shift - pitch * lp.y) * arms / (6.2831853 * pitch);
    float da = abs(fract(across + seed) - 0.5);                 // 0 on an arm
    float arm = exp(-pow(da / 0.12, 2.0));
    // the dust: round grains on a lattice in (log r, angle * scale) -- conformal, so they stay round
    vec2 g = vec2(lp.x + shift, lp.y) / grain;
    vec2 id = floor(g);
    float light = 0.0;
    for (int j = 0; j < 4; ++j) {
        vec2 c = id + vec2(float(j & 1), float(j >> 1));
        float hc = fract(sin(dot(c, vec2(12.9898, 78.233)) + seed * 17.0) * 43758.5453);
        vec2 at = c + vec2(fract(hc * 7.3), fract(hc * 3.1)) - 0.5;
        float r = length(g - at);
        light += exp(-r * r * 9.0) * step(1.0 - dust, fract(hc * 11.7));
    }
    return arm * (0.25 + light);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float h = max(audioHarmAdvance, 0.0);
    float pitch = 0.3063 * (1.0 + 0.08 * sin(0.7 * h) + 0.03 * sin(0.31 * h + 1.0));   // golden: 2 ln(phi) / pi
    float arms = floor(2.0 + 3.0 * clamp(armP, 0.0, 1.0));
    // the grains' size divides a full turn, so the lattice closes up at +-pi
    float grain = 6.2831853 / floor(6.2831853 / (0.03 + 0.03 * clamp(grainP, 0.0, 1.0)));
    float dust = 0.35 + 0.5 * clamp(audioSwell, 0.0, 1.0);
    float sink = 0.05 * sceneTime + 0.22 * audioAdvance;
    float r = max(length(p), 1e-4);
    vec2 lp = vec2(log(r), atan(p.y, p.x));
    vec3 col = vec3(0.0);
    // arms turning one way, finer arms the other, and a third family between
    col += famLight(fh, 0.2, 0.2) * spiralDust(lp, arms, pitch, sink, grain, dust, 0.0);
    col += famLight(fh, 0.5, 0.3) * spiralDust(vec2(lp.x, -lp.y), arms + 1.0, pitch * 1.3, 0.7 * sink, grain * 0.5, dust, 0.37);
    col += famLight(fh, 0.8, 0.5) * spiralDust(lp, 2.0 * arms, pitch * 0.62, 1.3 * sink, grain * 0.5, dust * 0.8, 0.71) * 0.7;
    // the eye of the nebula: a soft glow at the centre, fading out
    col += famCol(fh, 0.6) * 0.15 * exp(-r * 6.0);
    col *= smoothstep(0.0, 0.05, r);
    col += famCol(fh, 0.5) * 0.012;
    finish(col);
}
