//@doc
 * @brief CLOISONNE GOLD CELLS: cloisonné: fine gold wires divide a surface into cells, and in every cell glass is fused in one colour from the photo, with the surface tension of the meniscus; the photo stands as a mosaic of glass beads in gold.  Each cell is a hexagon of the photo's mean colour,
 * lit as a little dome with a specular point, bordered by a brushed gold wire.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the cell size glides (integrated)
 *   audioRolloff -> the gloss of the glass
 *
 * Knobs: sizeP (the largest cell), hueP.
//@params sizeP
//@audio audioRolloff audioAdvance
//@body
void main()
{
    vec2 fc = gl_FragCoord.xy;
    float px = resolution.y / 270.0;
    float big = 16.0 + 18.0 * clamp(sizeP, 0.0, 1.0);
    float Sb = exp(mix(log(8.0), log(big), 0.5 + 0.5 * sin(0.05 * sceneTime + 0.03 * audioAdvance)));
    float S = Sb * px;
    vec2 q = fc / S;
    vec2 r = vec2(1.0, 1.7320508);
    vec2 h = r * 0.5;
    vec2 a = mod(q, r) - h;
    vec2 b = mod(q - h, r) - h;
    vec2 gv = dot(a, a) < dot(b, b) ? a : b;
    vec2 id = q - gv;
    vec3 c = imgLod(((id * S) - 0.5 * resolution) / resolution.y * 0.85 + 0.5, log2(Sb) - 0.3);
    c = mix(vec3(luma(c)), c, 1.35);
    float hd = max(abs(gv.x) * 0.8660254 + abs(gv.y) * 0.5, abs(gv.y)) * 2.0;
    float glass = 1.0 - smoothstep(0.82, 0.88, hd);
    vec3 n = normalize(vec3(gv * 1.8, 0.9 * sqrt(max(1.0 - hd * hd, 0.0)) + 0.2));
    vec3 L = normalize(vec3(-0.4, 0.55, 0.75));
    float dif = 0.55 + 0.6 * max(dot(n, L), 0.0);
    float gl = 0.4 + 0.9 * clamp(audioRolloff, 0.0, 1.0);
    float spec = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 22.0) * gl;
    vec3 glassc = c * dif * (1.0 - 0.3 * hd * hd) + spec;
    float brush = noise2(fc / px * vec2(0.9, 0.12) + id * 7.0);
    vec3 gold = vec3(1.0, 0.78, 0.32) * (0.55 + 0.6 * brush) * (0.8 + 0.3 * smoothstep(0.88, 1.0, hd));
    finish(mix(gold, glassc, glass) * 1.1);
}
