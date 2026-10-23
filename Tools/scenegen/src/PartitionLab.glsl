//@doc
 * @brief PARTITION LAB: the whole picture divided into cells -- a quadtree of uneven squares, Voronoi cells, stripes,
 * rings, honeycomb, triangles, log-spiral sectors, or a brick wall -- and every cell showing the photo in a mapping of
 * its own: zoomed, turned, mirrored, taken from another place, drifting on its own clock, swirled, magnified at the middle,
 * or the whole photo shrunk into the cell.  The mapping is picked by the cell's hash, so neighbours differ and the
 * photo is cut into pieces that no longer fit, yet every piece is a window onto the same picture and the seams are only
 * seams (soft shadows, a bevel, a matte centre).  A fourth stage moves the division itself: drifting, breathing, shearing,
 * swirling.  The walk changes one stage at a time and cross-fades the looks; a new section of the music gives all four
 * stages new classes.  Eight divisions, eight mappings, four seams, five motions: a thousand and more looks.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the cells' mappings differ more (the slow envelope) and the division breathes
 *   audioPhase      -> the divisions turn and the cells' windows drift (integrated)
 *   audioSpread     -> the seams' depth
 *   audioSectionId/Age -> a new section re-rolls division, mapping, seam and motion
 *
 * Knobs: seedP (the walk's seed), cellsP (how many cells), mixP (how different the cells' windows are), hueP.
//@params seedP cellsP mixP
//@audio audioSwell audioSpread
//@body
/**  The cell a place lies in, for one of eight divisions of the plane.
 *
 * @param kind    The division: 0 quadtree, 1 Voronoi, 2 stripes, 3 rings, 4 honeycomb, 5 triangles, 6 spiral sectors, 7 bricks. (in)
 * @param p       The place. (in)
 * @param sc      Cells per unit. (in)
 * @param id      A number that is the same everywhere in the cell and differs between cells. (out)
 * @param centre  The cell's centre (stripes and rings: the nearest point of the cell's axis). (out)
 * @param size    The cell's half size. (out)
 **/
void partCell(int kind, vec2 p, float sc, out vec2 id, out vec2 centre, out float size)
{
    id = vec2(0.0);
    centre = vec2(0.0);
    size = 0.5 / sc;
    if (kind == 0) {
        float cs = 2.0 / sc;
        vec2 c = floor(p / cs);
        for (int i = 0; i < 3; ++i) {
            if (hash21(c + 17.0 * float(i)) < 0.62) { cs *= 0.5; c = floor(p / cs); } else break;
        }
        centre = (c + 0.5) * cs;
        id = centre;
        size = 0.5 * cs;
    } else if (kind == 1) {
        vec2 q = p * sc;
        vec2 g = floor(q);
        float best = 9.0;
        for (int j = -1; j <= 1; ++j) {
            for (int i = -1; i <= 1; ++i) {
                vec2 cg = g + vec2(float(i), float(j));
                vec2 pt = cg + 0.15 + 0.7 * hash22(cg);
                float d = dot(q - pt, q - pt);
                if (d < best) { best = d; centre = pt / sc; id = cg; }
            }
        }
    } else if (kind == 2) {
        vec2 dir = vec2(0.8660254, 0.5);
        vec2 per = vec2(-dir.y, dir.x);
        float u = dot(p, dir) * sc * 0.6;
        float i = floor(u);
        id = vec2(i, 0.0);
        centre = dir * (i + 0.5) / (sc * 0.6) + per * dot(p, per);
        size = 0.5 / (sc * 0.6);
    } else if (kind == 3) {
        float r = length(p) * sc * 0.7;
        float i = floor(r);
        id = vec2(i, 0.0);
        centre = normalize(p + 1e-5) * (i + 0.5) / (sc * 0.7);
        size = 0.5 / (sc * 0.7);
    } else if (kind == 4) {
        vec2 q = p * sc * 0.8;
        vec2 r = vec2(1.0, 1.7320508);
        vec2 h = r * 0.5;
        vec2 a = mod(q, r) - h;
        vec2 b = mod(q - h, r) - h;
        vec2 gv = dot(a, a) < dot(b, b) ? a : b;
        centre = (q - gv) / (sc * 0.8);
        id = floor((q - gv) * 2.0 + 0.5);
        size = 0.5 / (sc * 0.8);
    } else if (kind == 5) {
        vec2 q = p * sc * 0.9;
        vec2 s = vec2(q.x + q.y * 0.57735, q.y * 1.1547);
        vec2 f = floor(s);
        vec2 fr = s - f;
        float up = fr.x + fr.y > 1.0 ? 1.0 : 0.0;
        vec2 cs = f + (up > 0.5 ? vec2(0.6667) : vec2(0.3333));
        float y = cs.y / 1.1547;
        centre = vec2(cs.x - y * 0.57735, y) / (sc * 0.9);
        id = f + up * 0.5;
        size = 0.55 / (sc * 0.9);
    } else if (kind == 6) {
        float n = 8.0;
        float ang = atan(p.y, p.x) / 6.2831853 + 0.5;
        float u = ang * n;
        float k = sc * 0.55;
        float v = log(max(length(p), 1e-4)) * k + 0.5 * u;
        float iu = floor(u);
        float iv = floor(v);
        float a = (iu + 0.5) / n * 6.2831853 - 3.14159265;
        float lr = ((iv + 0.5) - 0.5 * (iu + 0.5)) / k;
        float r = exp(lr);
        centre = r * vec2(cos(a), sin(a));
        id = vec2(iu, iv);
        size = 0.5 * r * 6.2831853 / n;
    } else {
        float h = 1.0 / sc;
        float row = floor(p.y / h);
        float off = 0.5 * (row - 2.0 * floor(row * 0.5));
        float cx = floor(p.x / (2.0 * h) + off);
        centre = vec2((cx + 0.5 - off) * 2.0 * h, (row + 0.5) * h);
        id = vec2(cx, row);
        size = 0.5 * h * 1.4;
    }
}

/**  Where a cell reads the photo.
 *
 * @param map     The mapping, 0..7: zoom, turn, mirror, offset, own clock, swirl, magnify, the whole photo. (in)
 * @param centre  The cell's centre. (in)
 * @param d       The place's offset from the centre. (in)
 * @param size    The cell's half size. (in)
 * @param id      The cell's number. (in)
 * @param t       The clock. (in)
 * @param mixAmt  How different the cells' windows are, 0..1. (in)
 *
 * @return
 *   The place in the photo.
 **/
vec2 partMap(int map, vec2 centre, vec2 d, float size, vec2 id, float t, float mixAmt)
{
    float h = hash21(id + 3.7);
    vec2 uvc = centre * 0.8 + 0.5;
    vec2 dd = d * 0.8;
    float par = (floor(id.x) + floor(id.y) - 2.0 * floor((floor(id.x) + floor(id.y)) * 0.5)) > 0.5 ? 1.0 : -1.0;
    float e = length(d) / max(size, 1e-4);
    if (map == 0) return uvc + dd * mix(1.0, 0.45 + 1.7 * h, mixAmt);
    if (map == 1) return uvc + rot2(mixAmt * ((h - 0.5) * 3.0 + 0.25 * t * (h - 0.5))) * dd;
    if (map == 2) return uvc + vec2(mix(1.0, par, mixAmt) * dd.x, dd.y);
    if (map == 3) return uvc + (hash22(id + 9.1) - 0.5) * 0.7 * mixAmt + dd;
    if (map == 4) return uvc + 0.2 * mixAmt * vec2(sin(0.2 * t + 6.283 * h), cos(0.17 * t + 9.0 * h)) + dd;
    if (map == 5) return uvc + rot2(mixAmt * 2.4 * (1.0 - min(e, 1.0)) * (h > 0.5 ? 1.0 : -1.0)) * dd;
    if (map == 6) return uvc + dd * mix(1.0, 0.45 + 0.55 * smoothstep(0.0, 1.0, e), mixAmt);
    return 0.5 + 0.45 * d / max(size, 1e-4) + (hash22(id) - 0.5) * 0.2 * mixAmt;
}

/**  One look of the lab: the divided picture.
 *
 * @param k    The classes: x the division, y the mapping, z the seam, w the division's motion. (in)
 * @param p    The place. (in)
 * @param sc   Cells per unit. (in)
 * @param t    The clock. (in)
 * @param mx   How different the cells' windows are. (in)
 * @param sd   The seams' depth. (in)
 *
 * @return
 *   The colour.
 **/
vec3 partLook(ivec4 k, vec2 p, float sc, float t, float mx, float sd)
{
    vec2 q = rot2(0.03 * t) * p;
    if (k.w == 1) q += 0.05 * t * vec2(0.8, 0.6);
    else if (k.w == 2) sc *= 1.0 + 0.18 * sin(0.3 * t);
    else if (k.w == 3) q.x += 0.12 * sin(5.0 * q.y + 0.4 * t);
    else if (k.w == 4) q = rot2(0.7 * exp(-3.0 * dot(q, q)) * sin(0.25 * t)) * q;
    vec2 id, centre;
    float size;
    partCell(k.x, q, sc, id, centre, size);
    vec2 d = q - centre;
    vec2 uv = partMap(k.y, centre, d, size, id, t, mx);
    vec3 col = imgLod(uv, 0.3);
    float e = 1.0 - clamp(length(d) / max(size, 1e-4), 0.0, 1.0);
    if (k.z == 1) col *= 1.0 - sd * 0.55 * (1.0 - smoothstep(0.0, 0.3, e));
    else if (k.z == 2) { vec2 dn = d / max(size, 1e-4); col *= 1.0 + sd * 0.5 * (1.0 - smoothstep(0.0, 0.18, e)) * clamp(-dn.x - dn.y, -1.0, 1.0); }
    else if (k.z == 3) col = mix(col, vec3(luma(col)) * 1.1, sd * 0.5 * smoothstep(0.1, 0.9, e)) * (1.0 - sd * 0.3 * (1.0 - smoothstep(0.0, 0.08, e)));
    return col;
}

void main()
{
    vec2 p = screenP();
    labWalk(seedP * 83.0, ivec4(8, 8, 4, 5), 1.0);
    float sw = clamp(audioSwell, 0.0, 1.0);
    float sc = (2.4 + 3.6 * clamp(cellsP, 0.0, 1.0)) * (1.0 + 0.1 * sw);
    float t = sceneTime * 0.7 + 5.0 * audioPhase;
    float mx = clamp(0.35 + 0.5 * clamp(mixP, 0.0, 1.0) + 0.3 * sw, 0.0, 1.0);
    float sd = 0.5 + 0.5 * clamp(audioSpread, 0.0, 1.0);
    vec3 col = vec3(0.0);
    float ws = 0.0;
    for (int i = 0; i < 4; ++i) {
        if (gLabW[i] > 0.002) {
            col += gLabW[i] * partLook(gLabK[i], p, sc, t, mx, sd);
            ws += gLabW[i];
        }
    }
    finish(max(col / max(ws, 1e-3), 0.0));
}
