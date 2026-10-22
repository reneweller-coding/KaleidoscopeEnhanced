//@doc
 * @brief AGATE BANDS BACKLIT: a slice of agate held against the light, seen so close that its bands fill the picture:
 * concentric bands round a sparkling crystal hollow, milky and clear by turns, in the photo's colours, and through every
 * phrase the bands grow outward by one, as the stone grew.  The bands follow the distance from an irregular heart (a
 * noise-bent distance), so they ripple and pinch like real agate; each band takes its colour from the photo along a line
 * through the stone and lets more or less light through; the bands' growth is the phrases counted, plus the share of the
 * current one (counted in a small field of the scene's own), so it never jumps.  The hollow in the middle glitters.
 * The colours are the photo's, calmed toward one colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos -> the bands grow outward by one band every phrase (counted)
 *   audioSwell     -> the light behind the slice
 *
 * Knobs: bandP (how fine the bands are), waveP (how much the bands ripple), hueP.
//@params bandP waveP
//@audio audioPhrasePos audioSwell
//@state 1 1 60 32
//@body
/**  The state pass: the phrases counted.
 *
 * @return
 *   x the phrases so far, y the last phrase position, 0, 1.
 **/
vec4 stateStep()
{
    float pp = clamp(audioPhrasePos, 0.0, 1.0);
    if (stateFrame < 0.5) return vec4(0.0, pp, 0.0, 1.0);
    vec4 old = texelFetch(texState, ivec2(0, 0), 0);
    return vec4(mod(old.x + (pp < old.y - 0.5 ? 1.0 : 0.0), 1000.0), pp, 0.0, 1.0);
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
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float fh = famHue();
    vec4 st = texelFetch(texState, ivec2(0, 0), 0);
    float grown = st.x + clamp(audioPhrasePos, 0.0, 1.0);             // phrases so far, carried on to this frame
    float freq = 9.0 + 9.0 * clamp(bandP, 0.0, 1.0);
    float wav = 0.08 + 0.12 * clamp(waveP, 0.0, 1.0);
    vec2 q = p + vec2(0.1, -0.05);
    float d = length(q * vec2(1.0, 1.25)) + wav * (fbm(q * 2.5 + 3.0) - 0.5) + 0.03 * fbm(q * 9.0);
    float u = d * freq - grown;                                      // the band's number, moving outward each phrase
    float band = floor(u);
    float fu = fract(u);
    vec3 c = tone(imgLod(vec2(0.5) + vec2(0.4 * fract(band * 0.137) - 0.2, 0.3 * fract(band * 0.311) - 0.15), 2.0), fh);
    float clear = mod(band, 2.0) < 0.5 ? 0.55 : 1.0;                  // milky and clear by turns
    float fine = 0.85 + 0.15 * sin(fu * 6.2831853 * 3.0);
    float px = freq * 1.5 / resolution.y;
    float line = exp(-pow((0.5 - abs(fu - 0.5)) / (px + 0.02), 2.0));
    float light = (0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0)) * (0.7 + 0.5 * exp(-dot(p, p) * 1.2));
    vec3 col = c * clear * fine * light * (1.0 - 0.35 * line);
    // the crystal hollow in the middle
    float hollow = 1.0 - smoothstep(0.14, 0.16, d);
    vec2 g = q * 40.0;
    float hg = hash21(floor(g));
    float glit = pow(hg, 6.0) * (0.5 + 0.5 * sin(2.0 * sceneTime + 6.2831853 * fract(hg * 7.0))) * exp(-dot(fract(g) - 0.5, fract(g) - 0.5) * 20.0);
    col = mix(col, famLight(fh, 0.6, 0.7) * (0.35 + 2.0 * glit) * light, hollow);
    finish(col);
}
