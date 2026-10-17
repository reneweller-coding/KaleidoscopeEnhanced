//@doc
 * @brief RAUZY FRACTAL TILES: the Rauzy fractal of the tribonacci substitution -- the set of all sums of powers of
 * the complex tribonacci root alpha with no three consecutive 1s -- a compact island with a fractal coast, made of
 * three sub-islands, and its periodic tiling of the whole plane by the lattice pi(e1 - e2), pi(e1 - e3).  Every
 * pixel finds its tile and sub-island by a bounded depth-first descent through the three self-similar pieces.  The
 * three sub-islands show three cuts of the photo; the plane drifts and turns slowly beneath the view.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> each change of harmony passes the photos on to the next sub-island (crossfaded)
 *   audioPhase      -> the plane turns (integrated)
 *   audioSwell      -> the tiles' relief
 *   audioKick       -> the coasts flash (light)
 *
 * Knobs: scaleP (tiles on screen), tintP (how strongly each tile is tinted), photoP (photo share), hueP.
//@params scaleP tintP photoP
//@audio audioSwell audioKick audioHarmAdvance
//@body
/**  Complex multiplication.
 *
 * @param a  One factor. (in)
 * @param b  The other. (in)
 *
 * @return
 *   a b.
 **/
vec2 cmulR(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }

/**  Whether a point lies in the Rauzy fractal, and in which of its three pieces: a depth-first descent through
 * R = alpha R  u  (1 + alpha^2 R)  u  (1 + alpha + alpha^3 R), keeping only the candidates inside R's bounding disc,
 * at most 120 nodes (99 % right on a sampled test).
 *
 * @param z  The point. (in)
 *
 * @return
 *   The piece (0, 1 or 2) the point lies in, or -1 outside.
 **/
int rauzyPiece(vec2 z)
{
    const vec2 ia1 = vec2(-0.7718445, -1.1151425);              // 1 / alpha
    const vec2 ia2 = vec2(-0.6478, 1.7214332);                  // 1 / alpha^2
    const vec2 ia3 = vec2(2.4196434, -0.6062907);               // 1 / alpha^3
    const vec2 al = vec2(-0.4196434, 0.6062907);                // alpha
    const vec2 c0 = vec2(0.2733, 0.1556);                       // the fractal's centre
    const float rad = 1.41;
    vec2 sz[48];
    int sl[48];
    int st[48];
    int sp = 0;
    sz[0] = z; sl[0] = 0; st[0] = -1; sp = 1;
    int nodes = 0;
    while (sp > 0 && nodes < 120) {
        --sp;
        vec2 w = sz[sp];
        int l = sl[sp], top = st[sp];
        ++nodes;
        if (l == 18) return top;
        vec2 c1 = cmulR(w, ia1), c2 = cmulR(w - vec2(1.0, 0.0), ia2), c3 = cmulR(w - vec2(1.0, 0.0) - al, ia3);
        float d1 = length(c1 - c0), d2 = length(c2 - c0), d3 = length(c3 - c0);
        // push the farther candidates first, so the nearest is tried first
        for (int k = 0; k < 3; ++k) {
            int pick = -1;
            float far = -1.0;
            if (d1 <= rad && d1 > far) { far = d1; pick = 0; }
            if (d2 <= rad && d2 > far) { far = d2; pick = 1; }
            if (d3 <= rad && d3 > far) { far = d3; pick = 2; }
            if (pick < 0 || sp >= 48) break;
            sz[sp] = pick == 0 ? c1 : (pick == 1 ? c2 : c3);
            sl[sp] = l + 1;
            st[sp] = top < 0 ? pick : top;
            ++sp;
            if (pick == 0) d1 = 1e9; else if (pick == 1) d2 = 1e9; else d3 = 1e9;
        }
    }
    return -1;
}

void main()
{
    vec2 p = screenP();
    float sc = 3.0 + 4.0 * clamp(scaleP, 0.0, 1.0);
    vec2 z = rot2(0.02 * audioPhase + 0.004 * sceneTime) * p * sc + vec2(0.03, 0.02) * sceneTime;
    // the lattice: L1 = pi(e1 - e2), L2 = pi(e1 - e3); try the nearest translates
    const vec2 L1 = vec2(2.4196434, -0.6062907), L2 = vec2(1.7718445, 1.1151425);
    mat2 B = mat2(L1, L2);
    vec2 mn = inverse(B) * (z - vec2(0.2733, 0.1556));
    vec2 base = floor(mn + 0.5);
    int piece = -1;
    vec2 tile = vec2(0.0);
    for (int k = 0; k < 9; ++k) {
        vec2 o = base + vec2(float(k % 3) - 1.0, float(k / 3) - 1.0);
        int pc = rauzyPiece(z - B * o);
        if (pc >= 0) { piece = pc; tile = o; break; }
    }
    float shift = max(audioHarmAdvance, 0.0);
    float fp = mod(float(max(piece, 0)) + floor(shift), 3.0);
    float fpN = mod(fp + 1.0, 3.0);
    float g = smoothstep(0.2, 0.8, fract(shift));
    vec2 uv = p * 0.7 + 0.5;
    vec3 a = imgLod(uv + vec2(0.31, 0.57) * fp, 0.5), b = imgLod(uv + vec2(0.31, 0.57) * fpN, 0.5);
    vec3 photo = mix(a, b, g);
    float th = hash21(tile + 0.37);
    vec3 tone = imgPalette(float(max(piece, 0)) / 3.0 + 0.2 * th + 0.03 * audioPhase);
    // each piece its own brightness and tone, each tile a little lighter or darker: the fractal coasts read
    float lvl = piece == 0 ? 1.15 : (piece == 1 ? 0.75 : 0.45);
    vec3 col = mix(photo, photo * tone * 2.0, 0.35 + 0.4 * clamp(tintP, 0.0, 1.0)) * lvl
               * (0.8 + 0.4 * th * clamp(audioSwell + 0.3, 0.0, 1.0));
    col = mix(col, tone * 0.5, 0.3 * (1.0 - clamp(photoP, 0.0, 1.0)));
    if (piece < 0) col = imgLod(uv, 2.0) * 0.1;
    float id = float(piece) + 3.0 * (tile.x * 7.0 + tile.y * 13.0);
    float coast = abs(dFdx(id)) + abs(dFdy(id));
    col = mix(col, mix(tone, vec3(1.0), 0.6) * (0.8 + 0.8 * clamp(audioKick, 0.0, 1.0)), min(coast, 1.0) * 0.85);
    finish(col);
}
