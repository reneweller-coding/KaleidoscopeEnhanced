//@doc
 * @brief TEXTURE GALAXY ARMS: the photo's colours wound into the spiral arms of a galaxy, its dark places drawn out
 * into lanes of dust along the arms, round a glowing core and through a field of stars; the galaxy turns with the
 * music's phase, and every section brings another number of arms.  The arms are logarithmic spirals: a place's position
 * along the spiral (its angle less the logarithm of its distance over the pitch) reads the photo, so its colours stream
 * along the arms; the dust is where the photo is dark, laid on the arms' inner edges.  A section's arm count -- two,
 * three or four -- is cross-faded over six seconds.  The colours are the photo, calmed toward one colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase         -> the galaxy turns (integrated)
 *   audioSectionId/Age -> every section brings another number of arms (cross-faded over six seconds)
 *   audioSwell         -> the core's and the arms' glow
 *
 * Knobs: pitchP (how tightly the arms wind), dustP (how dark the dust lanes are), hueP.
//@params pitchP dustP
//@audio audioPhase audioSectionId audioSectionPrev audioSectionAge audioSwell
//@body
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

/**  The arms' light and their dust at a place, for one arm count.
 *
 * @param r     The distance from the core. (in)
 * @param a     The angle, turned. (in)
 * @param n     The arms. (in)
 * @param B     The spiral's pitch. (in)
 * @param dust  How dark the dust is. (in)
 * @param fh    The family's hue. (in)
 *
 * @return
 *   The light.
 **/
vec3 arms(float r, float a, float n, float B, float dust, float fh)
{
    float s = a - log(max(r, 1e-3)) / B;                              // the place along the spiral
    float ph = n * s;
    float arm = pow(0.5 + 0.5 * cos(ph), 2.5);
    vec2 uv = vec2(0.5) + 0.35 * vec2(cos(s), sin(s)) * (0.3 + 0.7 * min(r, 1.0));
    vec3 c = tone(imgLod(uv, 2.0), fh);
    float lane = (1.0 - smoothstep(0.15, 0.55, luma(imgLod(uv + 0.02, 3.0)))) * pow(0.5 + 0.5 * cos(ph - 0.7), 6.0);
    return c * arm * (1.0 - dust * lane) * (1.2 * exp(-r * 1.2) + 0.15);
}

void main()
{
    vec2 p = screenP() * 1.1;
    float fh = famHue();
    float r = length(p), a = atan(p.y, p.x) + 0.02 * sceneTime + 0.3 * audioPhase;
    float B = 0.25 + 0.2 * clamp(pitchP, 0.0, 1.0);
    float dust = 0.5 + 0.45 * clamp(dustP, 0.0, 1.0);
    float m = smoothstep(0.0, 6.0, audioSectionAge);
    float nA = 2.0 + mod(max(audioSectionPrev, 0.0), 3.0), nB = 2.0 + mod(max(audioSectionId, 0.0), 3.0);
    vec3 col = m * arms(r, a, nB, B, dust, fh);
    if (m < 0.999) col += (1.0 - m) * arms(r, a, nA, B, dust, fh);
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    col *= glow;
    col += famLight(fh, 0.7, 0.7) * (exp(-r * r / 0.01) * 1.3 + exp(-r / 0.12) * 0.4) * glow;
    // the stars: round, jittered
    vec2 g = p * 60.0;
    vec2 cell = floor(g);
    vec2 h = hash22(cell);
    float st = exp(-dot(fract(g) - 0.5 - (h - 0.5) * 0.6, fract(g) - 0.5 - (h - 0.5) * 0.6) / 0.004) * step(0.86, hash21(cell + 3.0));
    col += famLight(fh, 0.5, 0.85) * st * 0.5;
    finish(famExpose(col, 1.35, 1.00, 0.00, fh));
}
