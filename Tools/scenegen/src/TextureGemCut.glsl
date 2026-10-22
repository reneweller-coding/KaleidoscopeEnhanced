//@doc
 * @brief TEXTURE GEM CUT: a brilliant seen from above, so close that its facets fill the picture: the table in the
 * middle, the star and kite facets round it, the girdle facets at the rim, each mirroring its own shard of the photo
 * with a little fire at its edges; the stone turns with the music's phase, the fire follows the brightness of the
 * sound, and every section brings another cut.  The cut is built in one folded sector: the distance from the middle
 * and the angle to the nearest sector line decide the facet; each facet has its tilt, mirrors the photo at a shard
 * that moves with the turn, and splits its colour channels a little for the fire.  A section's cut (eight, ten or twelve
 * sectors) is cross-faded over six seconds.  The shards are the photo, calmed toward one colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase         -> the stone turns (integrated)
 *   audioRolloff       -> the fire: how far the colour channels split
 *   audioSectionId/Age -> every section brings another cut (cross-faded over six seconds)
 *   audioSwell         -> the facets' brightness
 *
 * Knobs: sizeP (the stone's size), fireP (how much fire), hueP.
//@params sizeP fireP
//@audio audioPhase audioRolloff audioSectionId audioSectionPrev audioSectionAge audioSwell
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

/**  The brilliant at a place, for one cut.
 *
 * @param p     The place (the stone's radius 1). (in)
 * @param n     The cut's sectors. (in)
 * @param turn  The stone's turn. (in)
 * @param fire  How far the channels split. (in)
 * @param px    A pixel. (in)
 * @param fh    The family's hue. (in)
 *
 * @return
 *   The light.
 **/
vec3 brilliant(vec2 p, float n, float turn, float fire, float px, float fh)
{
    float r = length(p), a = atan(p.y, p.x) - turn;
    float sec = 6.2831853 / n;
    float si = floor(a / sec + 0.5);
    float u = a - si * sec;                                           // the angle from the sector's line
    float au = abs(u) / (0.5 * sec);                                  // 0 on the line, 1 at the sector's edge
    float rt = 0.42 / cos(min(abs(u), 0.5 * sec));                    // the table's polygon
    float facet, edgeD;
    if (r < rt) { facet = 0.0; edgeD = rt - r; }
    else if (r < 0.62 + 0.08 * (1.0 - au)) { facet = au < 0.5 ? 1.0 : 2.0; edgeD = min(r - rt, abs(au - 0.5) * r * 0.5 * sec); }
    else { facet = u < 0.0 ? 3.0 : 4.0; edgeD = min(abs(u) * r, abs(r - 0.62 - 0.08 * (1.0 - au))); }
    float fid = mod(si, n) * 5.0 + facet;
    float tilt = facet * 0.35;
    vec2 nrm = vec2(cos(si * sec + turn + (u < 0.0 ? -0.2 : 0.2)), sin(si * sec + turn + (u < 0.0 ? -0.2 : 0.2))) * tilt;
    vec2 shard = vec2(0.5) + 0.3 * vec2(hash11(fid), hash11(fid + 7.0)) - 0.15 + p * 0.25 + nrm * 0.4;
    vec3 c;
    c.r = tone(imgLod(fract(shard + nrm * fire), 1.0), fh).r;
    c.g = tone(imgLod(fract(shard), 1.0), fh).g;
    c.b = tone(imgLod(fract(shard - nrm * fire), 1.0), fh).b;
    float bright = 0.55 + 0.5 * hash11(fid * 3.1 + 1.0);
    c *= bright;
    c += famLight(fh, 0.6, 0.8) * exp(-pow(edgeD / (1.5 * px + 0.003), 2.0)) * 0.45;
    return c;
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float size = 1.0 + 0.4 * clamp(sizeP, 0.0, 1.0);
    vec2 q = p / (0.5 * size);
    float turn = 0.02 * sceneTime + 0.3 * audioPhase;
    float fire = (0.01 + 0.04 * clamp(fireP, 0.0, 1.0)) * (0.4 + 1.2 * clamp(audioRolloff, 0.0, 1.0));
    float px = 1.0 / (0.5 * size * resolution.y);
    float m = smoothstep(0.0, 6.0, audioSectionAge);
    float nA = 8.0 + 2.0 * mod(max(audioSectionPrev, 0.0), 3.0), nB = 8.0 + 2.0 * mod(max(audioSectionId, 0.0), 3.0);
    vec3 col = m * brilliant(q, nB, turn, fire, px, fh);
    if (m < 0.999) col += (1.0 - m) * brilliant(q, nA, turn, fire, px, fh);
    col *= 0.7 + 0.5 * clamp(audioSwell, 0.0, 1.0);
    finish(col);
}
