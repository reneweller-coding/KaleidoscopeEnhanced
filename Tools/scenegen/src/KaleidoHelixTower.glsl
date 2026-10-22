//@doc
 * @brief KALEIDO HELIX TOWER: a spiral ramp of kaleidoscopic tiles screwing into the depth -- each tile a small rosette
 * of its own -- seen from above, so the ramp's turns shrink toward the middle like a stairwell without end.  In
 * log-polar coordinates (log of the radius, angle) the ramp is a straight strip and screwing deeper is a shift, so
 * the descent never needs to wrap; tiles are cells along the strip, each folded into a rosette of the photo, the
 * strip's rim a dark gap.  The photo's own colours, calmed toward one colour family; deeper turns dimmer.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance   -> the screw turns downward (integrated)
 *   audioChromaHue -> the key sets the tiles' symmetry (the light of two symmetries cross-faded)
 *   audioSwell     -> the tiles' glow
 *
 * Knobs: tileP (how many tiles per turn), pitchP (the ramp's pitch), hueP.
//@params tileP pitchP
//@audio audioChromaHue audioSwell
//@body
/**  The dihedral fold: a direction folded into one mirror sector of the given count.
 *
 * @param d      The point (centre at 0). (in)
 * @param sides  The number of mirrors. (in)
 *
 * @return
 *   The folded point.
 **/
vec2 kfold(vec2 d, float sides)
{
    float sec = 6.2831853 / sides;
    float a = abs(mod(atan(d.y, d.x), sec) - 0.5 * sec);
    return length(d) * vec2(cos(a), sin(a));
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

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float tiles = floor(8.0 + 8.0 * clamp(tileP, 0.0, 1.0));
    float pitch = 0.45 + 0.35 * clamp(pitchP, 0.0, 1.0);       // log-radius gained per turn
    float sym = 4.0 + 4.0 * (0.5 + 0.5 * sin(audioChromaHue));
    float sk = floor(sym), sm = smoothstep(0.2, 0.8, sym - sk);
    float screw = 0.05 * sceneTime + 0.25 * audioAdvance;
    float r = max(length(p), 1e-4);
    float u = log(r);
    float a = atan(p.y, p.x) / 6.2831853;                       // turns, -0.5 .. 0.5
    // the ramp: along the strip (s, in turns) and across it (c, 0..1); a shift in u is the descent
    float s = a + (u + screw * pitch) / pitch;
    float c = fract(s);                                          // across the ramp, between two turns
    float along = a - floor(s);                                  // along the ramp, continuous across the seam
    float k = floor(along * tiles);
    float f = fract(along * tiles);
    // each tile a little rosette: local coordinates across (c) and along (f)
    vec2 q = vec2(f - 0.5, c - 0.5);
    float hk = fract(sin(k * 12.9898) * 43758.5453);
    vec2 uvA = kfold(rot2(6.2831853 * hk) * q, sk) * 0.55 + vec2(0.2 + 0.6 * hk, 0.3 + 0.4 * fract(hk * 3.7));
    vec2 uvB = kfold(rot2(6.2831853 * hk) * q, sk + 1.0) * 0.55 + vec2(0.2 + 0.6 * hk, 0.3 + 0.4 * fract(hk * 3.7));
    vec3 col = mix(tone(imgLod(uvA, 0.8), fh), tone(imgLod(uvB, 0.8), fh), sm);
    // the ramp's rim and the tiles' joints; deeper turns dimmer, the middle a soft glow
    col *= smoothstep(0.0, 0.06, min(c, 1.0 - c)) * smoothstep(0.0, 0.04, min(f, 1.0 - f));
    col *= (0.85 + 0.3 * clamp(audioSwell, 0.0, 1.0)) * smoothstep(-4.5, -0.5, u);
    col += famLight(fh, 0.6, 0.5) * 0.12 * exp(-r * 12.0);
    finish(col);
}
