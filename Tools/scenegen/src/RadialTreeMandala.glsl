//@doc
 * @brief RADIAL TREE MANDALA: fractal trees set in a ring, their trunks standing on a circle and growing inward toward
 * the centre while a second ring grows outward to the corners, their branches interlacing into a mandala of twigs;
 * the branching angle opens and closes with the chords.  The mandala is folded into mirrored sectors, each holding one
 * tree of each ring; a tree is drawn by repeated folding: measure the segment, step to its tip, mirror the sides,
 * turn by the branching angle, shorten -- seven times.  The twigs glow brighter toward their tips.  The light is
 * shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the branching angle opens and closes with the chords
 *   audioAdvance     -> the mandala turns slowly (integrated)
 *   audioSwell       -> the twigs' glow
 *
 * Knobs: treeP (how many trees round the ring), lenP (the branches' length), hueP.
//@params treeP lenP
//@audio audioHarmAdvance audioSwell
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

/**  A fractal tree: the distance to its branches and how deep the nearest one lies.
 *
 * @param q    The place, the trunk's foot at 0 and the trunk along +y. (in)
 * @param L    The trunk's length. (in)
 * @param ang  The branching angle. (in)
 *
 * @return
 *   x the distance, y the nearest branch's depth (0 trunk .. 1 twig).
 **/
vec2 tree(vec2 q, float L, float ang)
{
    float d = segD(q, vec2(0.0), vec2(0.0, L));
    float depth = 0.0;
    for (int i = 1; i <= 7; ++i) {
        q.y -= L;
        q.x = abs(q.x);
        q = rot2(-ang) * q;                                           // (rot2(a) turns by -a: the branch leans out)
        L *= 0.72;
        float di = segD(q, vec2(0.0), vec2(0.0, L));
        if (di < d) { d = di; depth = float(i) / 7.0; }
    }
    return vec2(d, depth);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float n = floor(6.0 + 4.0 * clamp(treeP, 0.0, 1.0));
    float L0 = 0.14 + 0.06 * clamp(lenP, 0.0, 1.0);
    float h = max(audioHarmAdvance, 0.0);
    float ang = 0.3 + 0.35 * (0.5 + 0.5 * sin(0.6 * h));
    float turn = 0.01 * sceneTime + 0.04 * audioAdvance;
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float r = length(p);
    float sec = 6.2831853 / n;
    float a = abs(mod(atan(p.y, p.x) + turn, sec) - 0.5 * sec);
    vec2 q = r * vec2(cos(a), sin(a));                               // the sector's middle along +x
    const float R0 = 0.5;
    vec2 tin = tree(vec2(q.y, R0 - q.x), L0, ang);                   // the ring growing inward
    vec2 tout = tree(vec2(q.y, q.x - R0), L0 * 0.9, ang * 1.1);      // and the ring growing outward
    float lw = 1.2 / resolution.y;
    vec3 col = famCol(fh, 0.45) * 0.02;
    col += famLight(fh, 0.3 + 0.4 * tin.y, 0.3 + 0.5 * tin.y) * exp(-pow(tin.x / (lw + 0.002 * (1.0 - tin.y)), 2.0)) * (0.5 + 0.8 * tin.y) * glow;
    col += famLight(fh, 0.5 + 0.3 * tout.y, 0.3 + 0.5 * tout.y) * exp(-pow(tout.x / (lw + 0.002 * (1.0 - tout.y)), 2.0)) * (0.4 + 0.7 * tout.y) * glow;
    col += famLight(fh, 0.5, 0.7) * exp(-pow((r - R0) / 0.003, 2.0)) * 0.3;
    finish(famExpose(col, 4.94, 0.70, 0.03, fh));
}
