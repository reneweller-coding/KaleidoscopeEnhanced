//@doc
 * @brief TWIN DRAGON REP-TILE: the twin dragon -- all sums of digits 0 and 1 times powers of 1 / (i - 1) -- a
 * fractal tile that tiles the plane with its translates by the Gaussian integers, and whose two halves are copies
 * of itself, smaller by root 2 and turned by 135 degrees.  So every tile belongs to a supertile of two, every
 * supertile to one of four: the hierarchy is drawn as nested fractal coastlines, fine to bold.  The view breathes in
 * and out through the levels; each level-2 supertile shows its own cut of the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the zoom breathes (integrated): finer levels come and go
 *   audioHarmAdvance -> each change of harmony lets the photos pass to the next supertile level (gliding)
 *   audioPhase      -> the plane turns (integrated)
 *   audioKick       -> the coastlines flash (light)
 *
 * Knobs: scaleP (the base size of the tiles), linesP (how bold the coastlines are), photoP (photo share), hueP.
//@params scaleP linesP photoP
//@audio audioKick audioHarmAdvance
//@body
/**  Complex multiplication.
 *
 * @param a  One factor. (in)
 * @param b  The other. (in)
 *
 * @return
 *   a b.
 **/
vec2 cmulD(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }

/**  Whether a point lies in the twin dragon T = { sum d_k b^-k }, b = i - 1: z is in T if b z or b z - 1 is
 * (a bounded depth-first descent, 80 nodes at most).
 *
 * @param z  The point. (in)
 *
 * @return
 *   True inside the tile.
 **/
bool inDragon(vec2 z)
{
    const vec2 b = vec2(-1.0, 1.0), c0 = vec2(-0.2, -0.1);
    const float rad = 1.22;
    vec2 sz[40];
    int sl[40];
    int sp = 1, nodes = 0;
    sz[0] = z; sl[0] = 0;
    while (sp > 0 && nodes < 80) {
        --sp;
        vec2 w = sz[sp];
        int l = sl[sp];
        ++nodes;
        if (l == 16) return true;
        vec2 c1 = cmulD(w, b), c2 = c1 - vec2(1.0, 0.0);
        float d1 = length(c1 - c0), d2 = length(c2 - c0);
        if (d1 <= rad && d2 <= rad && sp < 39) {
            sz[sp] = d1 > d2 ? c1 : c2; sl[sp] = l + 1; ++sp;
            sz[sp] = d1 > d2 ? c2 : c1; sl[sp] = l + 1; ++sp;
        } else if (d1 <= rad && sp < 40) { sz[sp] = c1; sl[sp] = l + 1; ++sp; }
        else if (d2 <= rad && sp < 40) { sz[sp] = c2; sl[sp] = l + 1; ++sp; }
    }
    return false;
}

void main()
{
    vec2 p = screenP();
    float breath = 0.5 + 0.5 * sin(0.03 * sceneTime + 0.01 * audioAdvance);
    float sc = (3.0 + 6.0 * clamp(scaleP, 0.0, 1.0)) * exp2(1.5 * breath);
    vec2 z = rot2(0.02 * audioPhase + 0.003 * sceneTime) * p * sc + vec2(0.11, 0.07) * sceneTime;
    // the Gaussian integer of this pixel's tile: the nearest few translates tried
    vec2 base = floor(z - vec2(-0.2, -0.1) + 0.5);
    vec2 g = vec2(0.0);
    bool found = false;
    for (int k = 0; k < 9; ++k) {
        vec2 o = base + vec2(float(k % 3) - 1.0, float(k / 3) - 1.0);
        if (inDragon(z - o)) { g = o; found = true; break; }
    }
    // the supertiles: g = b g1 + d with d the parity of g's coordinates
    vec2 gl[4];
    gl[0] = g;
    for (int l = 1; l < 4; ++l) {
        vec2 q = gl[l - 1];
        float d = mod(q.x + q.y, 2.0);
        q -= vec2(d, 0.0);
        // divide by b = -1 + i: (x + i y) / (-1 + i) = ((-x + y) + i (-x - y)) / 2
        gl[l] = vec2(-q.x + q.y, -q.x - q.y) * 0.5;
    }
    float h = max(audioHarmAdvance, 0.0);
    float lvl = 1.0 + mod(floor(h), 3.0);
    float gli = smoothstep(0.2, 0.8, fract(h));
    vec2 idA = lvl < 1.5 ? gl[1] : (lvl < 2.5 ? gl[2] : gl[3]);
    vec2 idB = lvl < 1.5 ? gl[2] : (lvl < 2.5 ? gl[3] : gl[1]);
    float hA = hash21(idA + 0.31), hB = hash21(idB + 0.31);
    vec2 uv = p * 0.7 + 0.5;
    vec3 a = imgLod(uv + vec2(hA, fract(hA * 7.3)) * 0.6, 0.5), bb = imgLod(uv + vec2(hB, fract(hB * 7.3)) * 0.6, 0.5);
    vec3 photo = mix(a, bb, gli);
    vec3 tone = imgPalette(mix(hA, hB, gli) + 0.03 * audioPhase);
    float shade = 0.5 + 0.6 * mix(hA, hB, gli);                 // every supertile its own brightness
    vec3 col = mix(tone * 1.4, photo * 1.2, 0.3 + 0.5 * clamp(photoP, 0.0, 1.0)) * shade;
    if (!found) col *= 0.3;
    // the coastlines of every level, bolder for the larger supertiles
    float line = 0.0;
    for (int l = 0; l < 4; ++l) {
        float id = hash21(gl[l] * 1.37 + float(l));
        float e = abs(dFdx(id)) + abs(dFdy(id));
        line = max(line, step(1e-4, e) * (0.25 + 0.25 * float(l)));
    }
    float w = 0.5 + 0.5 * clamp(linesP, 0.0, 1.0);
    col = mix(col, mix(tone, vec3(1.0), 0.6) * (0.8 + 0.7 * clamp(audioKick, 0.0, 1.0)), min(line * w * 1.4, 1.0));
    finish(col);
}
