//@doc
 * @brief METER LAB: the bar as geometry -- the picture divided by the counts of a metre into cells, one column to a
 * beat and one row to a bar of the eight-bar phrase, and each cell showing the photo in a mapping of its own: its
 * accented beats larger, its counts turned a step further, its windows moved.  The vocabulary of metres is 4/4, 3/4,
 * 6/8, 5/4 (three and two), 7/8 (two, two and three), a three-against-four polyrhythm, the tresillo 3-3-2 and the
 * Euclidean rhythm E(5,8).  A second stage chooses the cell mapping, a third how the counting shows (a glow on the
 * playing beat, accent contrast, a filling sweep, a fading trail), a fourth the layout (a grid, rings, a slanted grid,
 * a spiral).  The counting itself comes from the music's beat, bar and phrase phases, which are continuous, so every
 * glow rises and falls without a jump; the cells keep their place.  The walk changes one stage at a time and
 * cross-fades; a new section changes all four.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBeatPhase, audioBarPhase, audioPhrasePos -> the counting: which beat, bar and phrase position glows
 *   audioSwell      -> the contrast of the glow and the mapping's spread
 *   audioPhase      -> the windows' slow drift (integrated)
 *   audioSectionId/Age -> a new section re-rolls every stage (a new metre, a new mapping)
 *
 * Knobs: seedP (the walk's seed), rowsP (how many bars show), spreadP (how far the cells' windows differ), hueP.
//@params seedP rowsP spreadP
//@audio audioSwell audioBeatPhase audioBarPhase audioPhrasePos
//@body
/**  The metre's beats per bar.
 *
 * @param m  The metre, 0..7. (in)
 *
 * @return
 *   The number of columns.
 **/
float meterBeats(int m)
{
    return m == 0 ? 4.0 : (m == 1 ? 3.0 : (m == 2 ? 6.0 : (m == 3 ? 5.0 : (m == 4 ? 7.0 : (m == 5 ? 12.0 : 8.0)))));
}

/**  The accent of a beat in a metre.
 *
 * @param m  The metre, 0..7. (in)
 * @param j  The beat, 0-based. (in)
 *
 * @return
 *   The accent, 0..1.
 **/
float meterAccent(int m, float j)
{
    float r = j;
    if (m == 0) return j < 0.5 ? 1.0 : (j > 1.5 && j < 2.5 ? 0.7 : 0.35);
    if (m == 1) return j < 0.5 ? 1.0 : 0.35;
    if (m == 2) return j < 0.5 ? 1.0 : (j > 2.5 && j < 3.5 ? 0.7 : 0.3);
    if (m == 3) return j < 0.5 ? 1.0 : (j > 2.5 && j < 3.5 ? 0.7 : 0.3);
    if (m == 4) return j < 0.5 ? 1.0 : ((j > 1.5 && j < 2.5) || (j > 3.5 && j < 4.5) ? 0.65 : 0.3);
    if (m == 5) return mod(r, 4.0) < 0.5 ? 1.0 : (mod(r, 3.0) < 0.5 ? 0.8 : 0.25);
    if (m == 6) return (j < 0.5 || (j > 2.5 && j < 3.5) || (j > 5.5 && j < 6.5)) ? 1.0 : 0.25;
    return (j < 0.5 || (j > 1.5 && j < 3.5) || (j > 4.5 && j < 6.5)) ? 1.0 : 0.25;
}

/**  One look of the lab.
 *
 * @param k    The classes: x the metre, y the cell mapping, z the way the counting shows, w the layout. (in)
 * @param p    The place. (in)
 * @param t    The clock. (in)
 * @param nr   The number of bars shown (rows), a whole number. (in)
 * @param sp   How far the cells' windows differ, 0..1. (in)
 * @param sw   The swell. (in)
 *
 * @return
 *   The colour.
 **/
vec3 meterLook(ivec4 k, vec2 p, float t, float nr, float sp, float sw)
{
    float nb = meterBeats(k.x);
    float X = p.x / 1.7778 + 0.5;
    float Y = p.y + 0.5;
    float bx, by;
    if (k.w == 0) { bx = X * nb; by = Y * nr; }
    else if (k.w == 1) { bx = (atan(p.y, p.x) / 6.2831853 + 0.5) * nb; by = length(p) * nr * 1.5; }
    else if (k.w == 2) { bx = (X + 0.35 * Y) * nb; by = (Y - 0.2 * X) * nr + 0.5; }
    else { float r = length(p); bx = (atan(p.y, p.x) / 6.2831853 + 0.5) * nb + r * 3.0 * nb * 0.5 + 0.0; by = r * nr * 1.5; }
    float j = floor(bx);
    float i = floor(by);
    vec2 f = vec2(fract(bx), fract(by)) - 0.5;
    vec2 cs = vec2(1.7778 / nb, 1.0 / nr);
    f *= cs / max(cs.x, cs.y);                       // a window that keeps the photo's proportions
    float jj = j - nb * floor(j / nb);
    float ii = i - nr * floor(i / nr);
    float acc = meterAccent(k.x, jj);
    float h = hash21(vec2(jj + 3.0, ii + 7.0));
    // the counting
    float pb = audioBarPhase * nb;
    float dj = abs(jj + 0.5 - pb);
    dj = min(dj, nb - dj);
    float glowB = exp(-dj * dj / 0.45);
    float pr = audioPhrasePos * nr;
    float di = abs(ii + 0.5 - pr);
    di = min(di, nr - di);
    float glowR = exp(-di * di / 1.2);
    // the cell's window
    vec2 uvc = vec2(X, Y) * 0.8 + 0.1;
    float sz = 0.45;
    float ang = 0.0;
    vec2 off = vec2(0.0);
    float par = (jj - 2.0 * floor(jj * 0.5)) > 0.5 ? -1.0 : 1.0;
    if (k.y == 0) sz = (0.3 + 0.8 * (1.0 - acc)) * (0.6 + 0.5 * sp);
    else if (k.y == 1) ang = sp * ((jj + 1.0) * 0.38 + ii * 0.1) + 0.04 * t;
    else if (k.y == 2) off = sp * (hash22(vec2(jj, ii) + 5.0) - 0.5) * 0.6;
    else if (k.y == 3) f.x *= mix(1.0, par, sp);
    else if (k.y == 4) off = 0.2 * sp * vec2(sin(0.2 * t + 0.9 * jj), cos(0.17 * t + 0.6 * ii));
    else { uvc = vec2(0.5); sz = 0.9; }
    vec2 uv = uvc + off + rot2(ang) * (f * sz);
    vec3 col = imgLod(uv, 0.4);
    float m = 1.0;
    float st = 0.6 + 0.5 * sw;
    if (k.z == 0) m = 0.45 + 0.95 * st * glowB * (0.6 + 0.4 * glowR);
    else if (k.z == 1) { col = mix(vec3(luma(col)), col, 0.3 + 0.9 * acc); m = 0.6 + 0.5 * acc * st; }
    else if (k.z == 2) m = 0.4 + 0.9 * smoothstep(jj - 0.5, jj + 0.5, pb) * (0.7 + 0.3 * glowR);
    else m = 0.4 + 0.95 * st * exp(-2.5 * mod(pb - (jj + 0.5) + nb, nb) / max(nb * 0.5, 1.0)) * (0.7 + 0.3 * glowR);
    return col * m;
}

void main()
{
    vec2 p = screenP();
    labWalk(seedP * 83.0, ivec4(8, 6, 4, 4), 1.0);
    float sw = clamp(audioSwell, 0.0, 1.0);
    float nr = floor(4.0 + 4.99 * clamp(rowsP, 0.0, 1.0));
    float sp = clamp(0.25 + 0.55 * clamp(spreadP, 0.0, 1.0) + 0.3 * sw, 0.0, 1.0);
    float t = sceneTime * 0.6 + 4.0 * audioPhase;
    vec3 col = vec3(0.0);
    float ws = 0.0;
    for (int i = 0; i < 4; ++i) {
        if (gLabW[i] > 0.002) {
            col += gLabW[i] * meterLook(gLabK[i], p, t, nr, sp, sw);
            ws += gLabW[i];
        }
    }
    finish(max(col / max(ws, 1e-3), 0.0));
}
