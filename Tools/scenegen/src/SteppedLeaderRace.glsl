//@doc
 * @brief STEPPED LEADER RACE: lightning's stepped leaders in slow motion: from the top of the picture several leaders
 * feel their way down as dense, branching channels of faint light, a level at a time over the phrase; near its end one
 * channel of each leader -- the chosen path -- warms into a soft glow instead of a blinding stroke (no flash), then
 * everything fades before the next phrase begins.  A leader is a random tree drawn by repeated folding, its forks
 * leaning by amounts taken from each branch's own number; the chosen path is the branch whose turns match the leader's
 * own sequence.  The light is shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos -> the leaders grow down over each phrase; near its end the chosen path glows softly, then all fades
 *   audioAdvance   -> the leaders sway slowly (integrated)
 *   audioSwell     -> the channels' glow
 *
 * Knobs: leaderP (how many leaders), forkP (how wide the forks open), hueP.
//@params leaderP forkP
//@audio audioPhrasePos audioSwell
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

/**  A leader: the distance to its channels, how deep the nearest lies and whether it is on the chosen path.
 *
 * @param q     The place, the leader's start at 0 and its first step along +y. (in)
 * @param L     The first step's length. (in)
 * @param seed  The leader's own number. (in)
 * @param grow  How many levels have grown (fractional). (in)
 * @param fork  How wide the forks open. (in)
 *
 * @return
 *   x the distance, y the depth (0..1), z 1 on the chosen path.
 **/
vec3 leader(vec2 q, float L, float seed, float grow, float fork)
{
    float d = segD(q, vec2(0.0), vec2(0.0, L));
    float depth = 0.0, chosen = 1.0, onPath = 1.0;
    float id = 1.0;
    for (int i = 1; i <= 9; ++i) {
        float fi = float(i);
        float vis = clamp(grow - fi + 1.0, 0.0, 1.0);
        if (vis <= 0.0) break;
        q.y -= L;
        float side = q.x < 0.0 ? 0.0 : 1.0;
        q.x = abs(q.x);
        id = mod(id * 2.0 + side, 8192.0);
        float h = fract(sin(id * 12.9898 + seed * 78.233) * 43758.5453);
        float want = step(0.5, fract(sin((fi + seed * 13.0) * 37.719) * 43758.5453));
        onPath *= 1.0 - abs(side - want);
        q = rot2(-(0.12 + fork * (0.15 + 0.45 * h))) * q;            // (rot2(a) turns by -a: the branch leans out)
        L *= 0.72 + 0.18 * fract(h * 7.1);
        float di = segD(q, vec2(0.0), vec2(0.0, L * vis)) + (1.0 - vis) * 0.01;
        if (di < d) { d = di; depth = fi / 9.0; chosen = onPath; }
    }
    return vec3(d, depth, chosen);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float N = floor(3.0 + 1.0 * clamp(leaderP, 0.0, 1.0) + 0.5);
    float fork = 0.5 + 0.5 * clamp(forkP, 0.0, 1.0);
    float pos = clamp(audioPhrasePos, 0.0, 1.0);
    float grow = 1.0 + 8.0 * smoothstep(0.0, 0.8, pos);
    float fadeAll = 1.0 - smoothstep(0.9, 1.0, pos);
    float chosenGlow = smoothstep(0.75, 0.9, pos) * (1.0 - smoothstep(0.95, 1.0, pos));
    float sway = 0.01 * sceneTime + 0.04 * audioAdvance;
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec3 col = famCol(fh, 0.45) * 0.02;
    for (int t = 0; t < 4; ++t) {
        float ft = float(t);
        if (ft >= N) break;
        vec2 root = vec2(1.4 * ((ft + 0.5) / N - 0.5) + 0.1 * sin(sway + ft), 0.52);
        vec2 rel = p - root;
        vec2 q = vec2(rel.x, -rel.y);                                 // growing downward
        vec3 l = leader(q, 0.17, ft + 1.0, grow, fork);
        float lw = 0.0012 + 0.0015 * (1.0 - l.y);
        float core = exp(-pow(l.x / lw, 2.0)), halo = exp(-l.x / (6.0 * lw));
        col += famLight(fh, 0.35 + 0.3 * l.y, 0.4) * (core + 0.25 * halo) * 0.6 * fadeAll * glow;
        col += famLight(fh, 0.5, 0.85) * (core + 0.6 * halo) * l.z * chosenGlow * 1.5 * glow;
    }
    finish(col);
}
