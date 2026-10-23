//@doc
 * @brief SCARAB ELYTRA PITTING: beetle wing covers: rows of pits and ribs with a sheen; the photo colours pits and ribs, and the light glides over the rows.  The rows run diagonally; in every row there are pits (small domes dented inwards) between thin ribs, each lit by a light that wanders, with a metallic
 * colour shift from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the light glides over the rows (integrated)
 *   audioSpread  -> the number of rows (smoothed)
 *
 * Knobs: sizeP (the size of the pits), hueP.
//@params sizeP
//@audio audioSpread audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float S = (0.05 + 0.04 * clamp(sizeP, 0.0, 1.0)) * (1.0 + 0.2 * clamp(audioSpread, 0.0, 1.0));
    vec2 q = rot2(0.5) * p / S;
    float row = floor(q.y);
    float fy = fract(q.y) - 0.5;
    float fx = fract(q.x + 0.5 * mod(row, 2.0)) - 0.5;
    vec2 cell = vec2(floor(q.x + 0.5 * mod(row, 2.0)), row);
    vec2 gv = vec2(fx, fy);
    float d = length(gv);
    float la = 0.03 * audioAdvance + 0.05 * sceneTime;
    vec3 L = normalize(vec3(0.6 * cos(la), 0.6 * sin(la), 0.6));
    float z = sqrt(max(0.2 - d * d, 0.0)) * -2.0;
    vec3 n = normalize(vec3(-gv * 2.0 * -1.0, 0.7));
    float dif = 0.5 + 0.7 * max(dot(n * vec3(-1.0, -1.0, 1.0), L), 0.0);
    float pit = 1.0 - smoothstep(0.32, 0.42, d);
    vec3 c = imgLod((rot2(-0.5) * (cell + 0.5) * S) * 0.85 + 0.5, 1.2);
    c = mix(vec3(luma(c)), c, 1.4);
    vec3 metal = 0.5 + 0.5 * cos(6.2831853 * (vec3(0.0, 0.33, 0.67) + luma(c) * 0.8 + 0.2 * dif));
    float rib = 1.0 - smoothstep(0.0, 0.1, abs(abs(fy) - 0.5));
    vec3 col = mix(c * 0.85, c * dif * 1.25, pit) * mix(vec3(1.0), metal * 1.2, 0.35);
    col = mix(col, c * 1.4 + 0.1, rib * 0.5);
    finish(col * 1.1);
}
