//@doc
 * @brief LEAF MARGIN SERRATION WAVE: toothed leaf margins: leaves with teeth whose row runs as a wave over the surface; the photo fills the leaves, and the number of teeth glides.  Leaves lie in rows, each a pointed oval with a serrated edge and a midrib with side veins; the teeth run along the edge as a wave.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the number of teeth glides with the key (integrated)
 *   audioAdvance     -> the wave of teeth runs along the edges (integrated)
 *
 * Knobs: sizeP (the size of the leaves), hueP.
//@params sizeP
//@audio audioAdvance audioHarmAdvance
//@body
void main()
{
    vec2 p = screenP();
    float S = 0.22 + 0.16 * clamp(sizeP, 0.0, 1.0);
    vec2 g = p / S;
    vec2 gi = floor(g);
    vec2 f = fract(g) - 0.5;
    float h = hash21(gi);
    float ang = 0.5 * sin(0.4 * gi.x + 0.5 * gi.y + 0.05 * audioAdvance + 0.07 * sceneTime) + (h - 0.5) * 0.5;
    vec2 q = rot2(ang) * f * vec2(1.0, 1.0);
    float u = q.x * 1.0 + 0.5;
    float wlen = 0.46;
    float tn = 7.0 + 3.0 * sin(0.05 * audioHarmAdvance + 0.02 * sceneTime);
    float saw = fract(tn * u - 0.15 * audioAdvance * 0.2 - 0.1 * sceneTime);
    float tooth = saw * 0.07;
    float w = 0.28 * sin(3.1415927 * clamp(u, 0.0, 1.0)) * (1.0 - 0.3 * u) + tooth * smoothstep(0.0, 0.2, u) * (1.0 - smoothstep(0.8, 1.0, u));
    float d = abs(q.y) - w;
    float inside = (1.0 - smoothstep(-0.004, 0.012, d)) * step(0.0, u) * step(u, 1.0);
    vec3 c = imgLod((gi * S + f * S) * 0.85 + 0.5, 0.8);
    c = mix(vec3(luma(c)), c, 1.3) * vec3(0.8, 1.1, 0.75);
    float rib = 1.0 - smoothstep(0.0, 0.012, abs(q.y));
    float veins = 1.0 - smoothstep(0.0, 0.015, abs(abs(q.y) - 0.35 * (fract(tn * u * 0.5) - 0.2) * 0.5));
    vec3 col = c * (0.75 + 0.3 * smoothstep(0.0, 0.3, w - abs(q.y)));
    col = mix(col, vec3(0.9, 0.95, 0.7), rib * 0.35 + veins * 0.12);
    vec3 bg = imgLod(p * 0.85 + 0.5, 2.5) * 0.12;
    finish(mix(bg, col * 1.2, inside));
}
