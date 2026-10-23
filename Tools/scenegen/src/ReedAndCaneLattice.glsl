//@doc
 * @brief REED AND CANE LATTICE: the photo seen through woven cane, the Viennese weave: every octagon of the weave is a hole onto the photo with the
 * light behind it, the small squares between them smaller holes, and the strands themselves cane-coloured, shaded round and tinted by
 * the photo.  The holes widen as the music swells and the weave slides slowly.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the holes' size
 *   audioPhase      -> the weave slides (integrated)
 *
 * Knobs: cellsP (the weave's fineness), strandP (the strands' width), hueP.
//@params cellsP strandP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float t = sceneTime * 0.05 + 0.4 * audioPhase;
    float N = 8.0 + 12.0 * clamp(cellsP, 0.0, 1.0);
    vec2 q = p * N + vec2(0.4 * sin(t), 0.3 * cos(1.3 * t));
    vec2 f = fract(q) - 0.5;
    vec2 g = fract(q + 0.5) - 0.5;
    float sw = clamp(audioSwell, 0.0, 1.0);
    float r1 = 0.36 + 0.08 * sw - 0.1 * clamp(strandP, 0.0, 1.0);
    float oct = max(max(abs(f.x), abs(f.y)), (abs(f.x) + abs(f.y)) * 0.7071);
    float sq = max(abs(g.x), abs(g.y));
    float h1 = smoothstep(r1, r1 - 0.04, oct);
    float h2 = smoothstep(0.1 + 0.05 * sw, 0.06 + 0.05 * sw, sq);
    float hole = max(h1, h2);
    float diag = 0.5 + 0.5 * sin(6.2831853 * (q.x + q.y) * 2.0);
    vec3 cane = vec3(0.62, 0.46, 0.27) * (0.55 + 0.4 * diag) * (0.5 + 0.7 * imgLod(uv, 4.0));
    vec3 behind = imgLod(uv, 0.5) * 1.2;
    finish(mix(cane, behind, hole));
}
