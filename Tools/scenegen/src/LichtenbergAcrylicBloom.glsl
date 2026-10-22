//@doc
 * @brief LICHTENBERG ACRYLIC BLOOM: Lichtenberg figures branching through a block of acrylic from all sides: glowing
 * dendrites, each fork leaning its own way, grow inward from the block's edges and from points within it, finer and
 * finer toward their tips, deeper ones dimmer; as the music swells they reach further, and each onset sends a glow
 * running through the twigs.  A dendrite is drawn by repeated folding: measure the branch, step to its tip, mirror
 * the sides, then turn and shorten by amounts taken from the branch's own number (the path of left and right turns
 * that leads to it), so every fork differs; the levels beyond the growth fade.  The glow is shades of one colour
 * family from the photo with a white core.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> how far the dendrites have grown (their deepest level)
 *   audioOnset   -> a glow runs through the twigs (light)
 *   audioAdvance -> the dendrites sway slowly (integrated)
 *
 * Knobs: treeP (the trees' size), forkP (how wide the forks open), hueP.
//@params treeP forkP
//@audio audioSwell audioOnset
//@body
/**  The distance from a point to a segment.
 *
 * @param p  The point. (in)
 * @param a  The segment's start. (in)
 * @param b  The segment's end. (in)
 *
 * @return
 *   The distance.
 **/
float segD(vec2 p, vec2 a, vec2 b)
{
    vec2 ab = b - a, ap = p - a;
    return length(ap - ab * clamp(dot(ap, ab) / max(dot(ab, ab), 1e-8), 0.0, 1.0));
}

/**  A dendrite: the distance to its branches and how deep the nearest lies.
 *
 * @param q     The place, the root at 0 and the trunk along +y. (in)
 * @param L     The trunk's length. (in)
 * @param seed  The dendrite's own number. (in)
 * @param grow  How many levels have grown (fractional: the last fades in). (in)
 * @param fork  How wide the forks open. (in)
 *
 * @return
 *   x the distance, y the nearest branch's depth (0 trunk .. 1 twig).
 **/
vec2 dendrite(vec2 q, float L, float seed, float grow, float fork)
{
    float d = segD(q, vec2(0.0), vec2(0.0, L));
    float depth = 0.0;
    float id = 1.0;
    for (int i = 1; i <= 8; ++i) {
        float fi = float(i);
        float vis = clamp(grow - fi + 1.0, 0.0, 1.0);
        if (vis <= 0.0) break;
        q.y -= L;
        float side = q.x < 0.0 ? 0.0 : 1.0;
        q.x = abs(q.x);
        id = mod(id * 2.0 + side, 4096.0);
        float h = fract(sin(id * 12.9898 + seed * 78.233) * 43758.5453);
        q = rot2(-(0.2 + fork * (0.3 + 0.5 * h))) * q;               // (rot2(a) turns by -a: the branch leans out)
        L *= 0.6 + 0.22 * fract(h * 7.1);
        float di = segD(q, vec2(0.0), vec2(0.0, L * vis)) + (1.0 - vis) * 0.01;   // a growing branch brightens in
        if (di < d) { d = di; depth = fi / 8.0; }
    }
    return vec2(d, depth);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float L0 = 0.13 + 0.06 * clamp(treeP, 0.0, 1.0);
    float fork = 0.5 + 0.5 * clamp(forkP, 0.0, 1.0);
    float grow = 3.0 + 5.0 * clamp(audioSwell, 0.0, 1.0);
    float sway = 0.01 * sceneTime + 0.04 * audioAdvance;
    float flash = clamp(audioOnset, 0.0, 1.0);
    vec3 col = famCol(fh, 0.45) * 0.02;
    for (int t = 0; t < 7; ++t) {
        float ft = float(t);
        // roots round the block's edges, pointing inward; the last ones deeper inside and dimmer
        float ang = 6.2831853 * ft / 5.0 + 0.3 * sin(sway + ft);
        vec2 root = t < 5 ? vec2(1.05 * cos(ang), 0.62 * sin(ang)) : vec2(0.35 * (ft - 5.5), 0.1 * sin(ft));
        vec2 dir = t < 5 ? -normalize(root) : vec2(sin(1.7 * ft + sway), cos(1.7 * ft + sway));
        float sc = t < 5 ? 1.0 : 0.6;
        vec2 rel = p - root;
        vec2 q = vec2(dot(rel, vec2(dir.y, -dir.x)), dot(rel, dir));
        vec2 dd = dendrite(q, L0 * sc, ft, grow, fork);
        float lw = (0.0012 + 0.002 * (1.0 - dd.y)) * sc;
        float core = exp(-pow(dd.x / lw, 2.0));
        float halo = exp(-dd.x / (6.0 * lw)) * 0.25;
        float dim = t < 5 ? 1.0 : 0.55;
        col += mix(famLight(fh, 0.3 + 0.4 * dd.y, 0.4), vec3(1.0), 0.4 * core) * (core + halo) * dim * (0.7 + 0.8 * flash * dd.y);
    }
    finish(col);
}
