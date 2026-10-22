//@doc
 * @brief WEAVE DRAFT MORPH: woven cloth seen up close, its threads glowing: plain weave, twill, satin or an overshot
 * pattern fill the picture, the cloth undulating gently, and with every section the weave glides into another -- the
 * threads stay, but which of them lies on top changes.  The cloth is a grid of crossings; a weave draft says for each
 * crossing whether the warp (running up) or the weft (running across) is on top; the top thread is shaded as a
 * cylinder with a soft sheen along it, the threads separated by narrow gaps.  The warp and weft take two shades of one
 * colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSectionId/Age -> every new section changes the weave (cross-faded over six seconds)
 *   audioSwell         -> the threads' sheen
 *   audioAdvance       -> the cloth undulates (integrated)
 *
 * Knobs: threadP (the threads' size), waveP (how much the cloth undulates), hueP.
//@params threadP waveP
//@audio audioSectionId audioSectionPrev audioSectionAge audioSwell
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

/**  A weave draft: whether the warp lies on top at a crossing.
 *
 * @param c     The crossing (warp, weft). (in)
 * @param kind  0 plain, 1 twill 2/2, 2 satin of five, 3 overshot blocks. (in)
 *
 * @return
 *   1 warp on top, 0 weft on top.
 **/
float warpUp(vec2 c, float kind)
{
    if (kind < 0.5) return mod(c.x + c.y, 2.0);
    if (kind < 1.5) return step(mod(c.x + c.y, 4.0), 1.5);
    if (kind < 2.5) return step(mod(2.0 * c.x + c.y, 5.0), 0.5);
    float block = mod(floor(c.x / 4.0) + floor(c.y / 4.0), 2.0);
    return block > 0.5 ? step(mod(c.x + c.y, 4.0), 1.5) : step(mod(c.x - c.y, 4.0), 0.5);
}

/**  The cloth for one weave.
 *
 * @param g      The place (in threads). (in)
 * @param kind   The weave. (in)
 * @param warpC  The warp's colour. (in)
 * @param weftC  The weft's colour. (in)
 * @param sheen  The sheen's strength. (in)
 *
 * @return
 *   The colour.
 **/
vec3 cloth(vec2 g, float kind, vec3 warpC, vec3 weftC, float sheen)
{
    vec2 c = floor(g), f = fract(g) - 0.5;
    float up = warpUp(c, kind);
    float across = up > 0.5 ? f.x : f.y;                              // across the top thread
    float along = up > 0.5 ? f.y : f.x;
    float cyl = sqrt(max(1.0 - pow(across / 0.42, 2.0), 0.0));
    float gap = smoothstep(0.5, 0.42, abs(across));
    float dip = 0.75 + 0.25 * cos(3.14159265 * along);                 // the thread dips where it passes under
    vec3 tc = up > 0.5 ? warpC : weftC;
    vec3 col = tc * (0.25 + 0.75 * cyl) * dip * gap;
    col += vec3(1.0, 0.95, 0.88) * pow(cyl, 8.0) * dip * gap * sheen * 0.35;
    return col;
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float S = 0.022 + 0.018 * clamp(threadP, 0.0, 1.0);
    float wv = 0.01 + 0.03 * clamp(waveP, 0.0, 1.0);
    float m = smoothstep(0.0, 6.0, audioSectionAge);
    float kA = mod(max(audioSectionPrev, 0.0), 4.0), kB = mod(max(audioSectionId, 0.0), 4.0);
    float run = 0.05 * sceneTime + 0.2 * audioAdvance;
    float sheen = 0.4 + 0.9 * clamp(audioSwell, 0.0, 1.0);
    vec2 w = p + wv * vec2(sin(3.0 * p.y + run), sin(2.5 * p.x - 0.8 * run));
    vec2 g = w / S;
    vec3 photo = tone(imgLod(p * 0.5 + 0.5, 3.0), fh);
    vec3 warpC = mix(famCol(fh, 0.3), photo, 0.35), weftC = mix(famCol(fh, 0.7), photo, 0.35);
    vec3 col = (1.0 - m) * cloth(g, kA, warpC, weftC, sheen) + m * cloth(g, kB, warpC, weftC, sheen);
    col *= 0.85 + 0.25 * sin(2.0 * p.x + 3.0 * p.y + run);           // the cloth's folds catch the light
    finish(col);
}
