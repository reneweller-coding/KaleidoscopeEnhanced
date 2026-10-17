//@doc
 * @brief CONWAY CRITERION TILES: tiles that fit together because their edges are bent the same way twice --
 * Escher's method: a hexagonal tiling whose edges are replaced by curves, each curve copied onto the opposite edge,
 * so however the curves writhe, the tiles still fill the plane without a gap.  The curves move all the time, the
 * tiles change shape like creatures breathing, the whole field drifts, and every tile carries its own cut of the
 * photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioMelody     -> the edge curves follow the smoothed melody (their bulges move with the tune)
 *   audioSwell      -> how far the edges bulge
 *   audioPhase      -> the curves' slow travel (integrated)
 *   audioKick       -> the outlines flash (light)
 *
 * Knobs: sizeP (tile size), bendP (the base bulge), outlineP (how strong the outlines are), hueP.
//@params sizeP bendP outlineP
//@audio audioSwell audioKick audioMelody[96] audioMelodyHead
//@body
/**  The melody of the last second or so, smoothed (a triangular window over the newest 16 samples).
 *
 * @return
 *   The smoothed pitch, 0..1 (0.5 when nothing sounds).
 **/
float smoothNote()
{
    int hi = int(audioMelodyHead * 96.0);
    float s = 0.0, w = 0.0;
    for (int j = 0; j < 16; ++j) {
        float m = audioMelody[(hi + 95 - j) % 96];
        float wj = (16.0 - float(j)) * step(0.001, m);
        s += wj * m;
        w += wj;
    }
    return w > 0.0 ? s / w : 0.5;
}
/**  The displacement that bends the edges: periodic on the hexagonal lattice (three waves along its vectors), so
 * every tile is bent alike and the tiling stays gap-free.
 *
 * @param x  The point in cell units. (in)
 *
 * @return
 *   The displacement.
 **/
vec2 bend(vec2 x)
{
    float amp = (0.08 + 0.14 * clamp(bendP, 0.0, 1.0)) * (0.7 + 0.6 * clamp(audioSwell, 0.0, 1.0));
    float t = 0.22 * sceneTime + 0.06 * audioPhase + 3.0 * smoothNote();
    vec2 d = vec2(0.0);
    for (int i = 0; i < 3; ++i) {
        float a = 2.0943951 * float(i);
        vec2 k = 6.2831853 * vec2(cos(a), sin(a)) * 1.1547;    // reciprocal hexagonal lattice vectors
        d += vec2(-sin(a), cos(a)) * sin(dot(k, x) + t + float(i) * 1.7);
        d += 0.5 * vec2(cos(a), sin(a)) * sin(2.0 * dot(k, x) - 0.7 * t);
    }
    return d * amp;
}

void main()
{
    vec2 p = screenP();
    float sz = 0.12 + 0.12 * clamp(sizeP, 0.0, 1.0);
    vec2 x = p / sz + vec2(0.07, 0.04) * sceneTime;           // the field drifts
    vec2 w = x + bend(x);
    // the hexagonal cell of the bent point: the nearest of the lattice points
    vec2 a = vec2(1.0, 1.7320508);
    vec2 h1 = mod(w, a) - 0.5 * a, h2 = mod(w - 0.5 * a, a) - 0.5 * a;
    vec2 loc = dot(h1, h1) < dot(h2, h2) ? h1 : h2;
    vec2 id = w - loc;
    float hh = hash21(floor(id * 2.0 + 0.5));
    vec2 uv = (loc * 0.6 + 0.5) * vec2(0.5, 0.5) + vec2(hh, fract(hh * 7.3)) * 0.5;
    vec3 photo = imgLod(uv, 0.5);
    vec3 tone = imgPalette(hh + 0.03 * audioPhase);
    vec3 col = mix(photo, photo * tone * 1.6, 0.25) * (0.75 + 0.4 * hh);
    // the outline: how close the bent point is to its hexagon's edge
    vec2 q = abs(loc);
    float edge = max(q.x, dot(q, vec2(0.5, 0.8660254)));
    float line = smoothstep(0.43, 0.5, edge);
    col = mix(col, mix(tone, vec3(1.0), 0.4) * (0.3 + 0.7 * clamp(audioKick, 0.0, 1.0)), line * (0.3 + 0.6 * clamp(outlineP, 0.0, 1.0)));
    finish(col);
}
