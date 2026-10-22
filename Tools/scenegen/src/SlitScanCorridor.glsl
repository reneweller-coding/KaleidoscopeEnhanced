//@doc
 * @brief SLIT SCAN CORRIDOR: the slit-scan corridor of "2001": two walls of coloured light patterns rushing past on
 * either side, streaked into long bands by their speed, converging on a vanishing point ahead, endless.  On a wall
 * at distance 1 from the axis a screen point at x sees depth 1 / |x| and height y / |x|; the pattern is a photo slice
 * stretched along the depth and scrolled by the travel, with bright slots, so it streams.  The patterns are the
 * photo's colours calmed toward one colour family; a new section swaps in the photo shown before.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance       -> the travel (integrated)
 *   audioSectionId/Age -> every new section crosses over to the other photo's patterns (over six seconds)
 *   audioSwell         -> the streaks' brightness
 *
 * Knobs: streakP (how long the streaks are), slotP (how many slots of light), hueP.  Distinct from SlitScanPhoto (a
 * time picture) and StargateWormhole (a ring).
//@params streakP slotP
//@audio audioSectionId audioSectionPrev audioSectionAge audioSwell
//@body
/**  A wall's pattern at (depth, height).
 *
 * @param z      The depth. (in)
 * @param y      The height. (in)
 * @param side   -1 or 1. (in)
 * @param which  0 the current photo, 1 the photo before. (in)
 * @param sl     The streak's stretch. (in)
 * @param slots  The slots' count. (in)
 *
 * @return
 *   The colour.
 **/
vec3 wall(float z, float y, float side, float which, float sl, float slots)
{
    vec2 uv = vec2(0.5 + 0.35 * tanh(y * 0.6), fract(z * sl * 0.03) * 0.8 + 0.1);
    uv.x = mix(uv.x, 1.0 - uv.x, step(0.0, side));
    vec3 c = which > 0.5 ? imgB(uv, 1.5) : imgLod(uv, 1.5);
    float slot = pow(0.5 + 0.5 * cos(slots * y + 2.0 * sin(0.3 * z)), 6.0);
    return c * (0.25 + 1.2 * slot);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float travel = 0.6 * sceneTime + 2.5 * audioAdvance;
    float sl = 0.4 + 0.8 * clamp(streakP, 0.0, 1.0);
    float slots = 12.0 + 18.0 * clamp(slotP, 0.0, 1.0);
    float m = smoothstep(0.0, 6.0, audioSectionAge);
    float wA = mod(max(audioSectionPrev, 0.0), 2.0), wB = mod(max(audioSectionId, 0.0), 2.0);
    float ax = max(abs(p.x), 0.002);
    float z = 0.6 / ax;                                          // depth along the wall
    float y = p.y / ax;                                          // height on the wall
    float side = sign(p.x);
    float zz = z + travel;
    vec3 c = mix(wall(zz, y, side, wA, sl, slots), wall(zz, y, side, wB, sl, slots), m);
    float l = luma(c);
    vec3 col = mix(c * 1.2, famCol(fh, 0.15 + 0.7 * l) * (0.3 + 1.2 * l), 0.45);
    col *= (0.7 + 0.6 * clamp(audioSwell, 0.0, 1.0)) * smoothstep(60.0, 8.0, z) * smoothstep(2.6, 1.2, abs(y));
    col += famLight(fh, 0.6, 0.7) * exp(-length(p) * 9.0) * 0.4; // the vanishing point's glow
    finish(col);
}
