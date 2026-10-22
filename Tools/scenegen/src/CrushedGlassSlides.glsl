//@doc
 * @brief CRUSHED GLASS SLIDES: slides of crushed coloured glass set in gelatine, projected: sharp shards in soft
 * colour, and in the projector's heat the gelatine slowly melts and flows, the shards drifting and softening at
 * their edges.  The shards are the cells of a Voronoi pattern, each one tinted glass with a bright bevelled rim;
 * the melt warps the pattern by a slow flow that grows with the heat.  Two slides alternate, cross-faded once a
 * phrase: the current photo's glass and the photo before.  The glass is two or three tones of each photo, calmed
 * toward one colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell     -> the heat: the gelatine melts further, the shards flow and soften
 *   audioPhrasePos -> the slides cross-fade over each phrase (continuous)
 *   audioAdvance   -> the melt flows (integrated)
 *
 * Knobs: shardP (how many shards), edgeP (how bright the bevels are), hueP.
//@params shardP edgeP
//@audio audioSwell audioPhrasePos
//@body
/**  One slide: Voronoi shards of tinted glass.
 *
 * @param q     The point on the slide. (in)
 * @param n     The shards' density. (in)
 * @param soft  How soft the shards' edges are. (in)
 * @param fh    The colour family. (in)
 * @param second  0 the current photo, 1 the photo before. (in)
 * @param rim   Returns the bevel's light. (out)
 *
 * @return
 *   The glass' colour.
 **/
vec3 slide(vec2 q, float n, float soft, float fh, float second, out float rim)
{
    vec2 g = q * n;
    vec2 c0 = floor(g);
    float d1 = 9.0, d2 = 9.0;
    vec2 best = vec2(0.0);
    for (int k = 0; k < 9; ++k) {
        vec2 c = c0 + vec2(float(k % 3) - 1.0, float(k / 3) - 1.0);
        vec2 s = c + hash22(c + 17.0 * second);
        float d = length(g - s);
        if (d < d1) { d2 = d1; d1 = d; best = c; }
        else if (d < d2) d2 = d;
    }
    float edge = (d2 - d1) * 0.5;
    rim = exp(-edge / (0.02 + 0.06 * soft));
    float hb = fract(sin(dot(best, vec2(12.9898, 78.233)) + 9.0 * second) * 43758.5453);
    vec2 uv = vec2(0.15 + 0.7 * hb, 0.2 + 0.6 * fract(hb * 3.7));
    vec3 photo = second > 0.5 ? imgB(uv, 5.0) : imgLod(uv, 5.0);
    float l = luma(photo);
    vec3 glass = mix(photo * 1.3, famCol(fh, 0.1 + 0.8 * hb) * (0.5 + 0.9 * l), 0.5);
    return glass * smoothstep(0.0, 0.03 + 0.08 * soft, edge) * (0.75 + 0.5 * hb);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float n = 3.0 + 4.0 * clamp(shardP, 0.0, 1.0);
    float heat = clamp(audioSwell, 0.0, 1.0);
    float t = 0.02 * sceneTime + 0.08 * audioAdvance;
    // the melt: a slow flow that grows with the heat
    vec2 q = p + (0.04 + 0.12 * heat) * vec2(fbm(p * 1.5 + vec2(t, 0.0)) - 0.5, fbm(p.yx * 1.5 - vec2(0.0, t)) - 0.5);
    float m = 0.5 - 0.5 * cos(6.2831853 * audioPhrasePos);
    float rA, rB;
    vec3 a = slide(q, n, heat, fh, 0.0, rA), b = slide(q + 0.3, n, heat, fh, 1.0, rB);
    vec3 col = mix(a, b, m);
    float rim = mix(rA, rB, m);
    col += famLight(fh, 0.6, 0.8) * rim * (0.15 + 0.4 * clamp(edgeP, 0.0, 1.0));
    float r = length(p);
    col *= smoothstep(1.2, 0.6, r) * (0.8 + 0.3 * exp(-r * r * 3.0));
    finish(col);
}
