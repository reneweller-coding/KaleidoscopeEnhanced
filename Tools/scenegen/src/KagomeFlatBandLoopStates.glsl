//@doc
 * @brief KAGOME FLAT BAND LOOP STATES: flat bands in the kagome lattice: electrons sit in compact loops round the hexagons and cannot move; the picture shows a lattice of glowing hexagon loops whose phases alternate, with the photo as the lattice background.  Every hexagon carries a ring of light whose phase runs
 * through three classes, and the triangles between the hexagons stay dark.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the phases drift (integrated)
 *   audioSpread  -> the size of the lattice (smoothed)
 *
 * Knobs: sizeP (the size of the hexagons), hueP.
//@params sizeP
//@audio audioSpread audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float S = (0.09 + 0.07 * clamp(sizeP, 0.0, 1.0)) * (1.0 + 0.2 * clamp(audioSpread, 0.0, 1.0));
    vec2 q = p / S;
    vec2 r2 = vec2(1.0, 1.7320508);
    vec2 h = r2 * 0.5;
    vec2 a = mod(q, r2) - h;
    vec2 b = mod(q - h, r2) - h;
    vec2 gv = dot(a, a) < dot(b, b) ? a : b;
    vec2 id = q - gv;
    float hd = max(abs(gv.x) * 0.8660254 + abs(gv.y) * 0.5, abs(gv.y)) * 2.0;
    float cls = mod(floor(id.x * 1.0 + 0.5) + 2.0 * floor(id.y / 1.7320508 + 0.5), 3.0);
    float ph = 6.2831853 * (0.06 * audioAdvance + 0.05 * sceneTime) + 2.0943951 * cls;
    float ring = exp(-pow((hd - 0.8) / 0.07, 2.0));
    float around = atan(gv.y, gv.x);
    float loop = 0.55 + 0.45 * cos(3.0 * around - ph);
    vec3 c = imgLod(id * S * 0.85 + 0.5, 1.5);
    c = mix(vec3(luma(c)), c, 1.4);
    vec3 bg = imgLod(p * 0.85 + 0.5, 1.2) * 0.35;
    vec3 col = bg + c * 1.6 * ring * loop + c * exp(-pow((hd - 0.8) / 0.22, 2.0)) * 0.15;
    float tri = smoothstep(0.82, 1.0, hd);
    col *= 1.0 - 0.45 * tri;
    finish(col * 1.1);
}
