//@doc
 * @brief SQUARED SQUARE COLLAGE: a square cut into twenty-one squares of all different sizes (Duijvestijn's perfect squared square of side 112,
 * the smallest there is), repeated over the whole picture; every square shows the photo at its own scale and every one turns its picture slowly,
 * each at its own phase.  Seams are only seams: the photo's colours fill every square.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the squares' turns, offset against each other (integrated)
 *   audioSwell      -> the sizes breathe: the pictures zoom in the squares a little
 *
 * Knobs: copiesP (how many copies of the big square across the picture), turnP (how far the pictures turn), hueP.
//@params copiesP turnP
//@audio audioSwell
//@body
/**  One square of the perfect squared square: its corner and its side.
 *
 * @param i  The square, 0..20. (in)
 *
 * @return
 *   x, y and the side, in units of the big square's side divided by 112.
 **/
vec3 squareAt(int i)
{
    if (i == 0) return vec3(0.0, 0.0, 50.0);
    if (i == 1) return vec3(50.0, 0.0, 35.0);
    if (i == 2) return vec3(85.0, 0.0, 27.0);
    if (i == 3) return vec3(85.0, 27.0, 8.0);
    if (i == 4) return vec3(93.0, 27.0, 19.0);
    if (i == 5) return vec3(50.0, 35.0, 15.0);
    if (i == 6) return vec3(65.0, 35.0, 17.0);
    if (i == 7) return vec3(82.0, 35.0, 11.0);
    if (i == 8) return vec3(82.0, 46.0, 6.0);
    if (i == 9) return vec3(88.0, 46.0, 24.0);
    if (i == 10) return vec3(0.0, 50.0, 29.0);
    if (i == 11) return vec3(29.0, 50.0, 25.0);
    if (i == 12) return vec3(54.0, 50.0, 9.0);
    if (i == 13) return vec3(63.0, 50.0, 2.0);
    if (i == 14) return vec3(63.0, 52.0, 7.0);
    if (i == 15) return vec3(70.0, 52.0, 18.0);
    if (i == 16) return vec3(54.0, 59.0, 16.0);
    if (i == 17) return vec3(70.0, 70.0, 42.0);
    if (i == 18) return vec3(29.0, 75.0, 4.0);
    if (i == 19) return vec3(33.0, 75.0, 37.0);
    return vec3(0.0, 79.0, 33.0);
}
void main()
{
    vec2 p = screenP();
    float t = sceneTime * 0.15 + 1.0 * audioPhase;
    float copies = 1.2 + 1.6 * clamp(copiesP, 0.0, 1.0);
    vec2 q = fract((p / copies) * vec2(1.0, 1.0) + 0.5 + vec2(0.03 * sin(0.05 * t), 0.0)) * 112.0;
    vec3 col = vec3(0.0);
    for (int i = 0; i < 21; ++i) {
        vec3 s = squareAt(i);
        vec2 l = (q - s.xy) / s.z;
        if (l.x >= 0.0 && l.x < 1.0 && l.y >= 0.0 && l.y < 1.0) {
            float fi = float(i);
            float ang = (0.3 + 0.9 * clamp(turnP, 0.0, 1.0)) * sin(t * (0.5 + 0.07 * fi) + 1.7 * fi);
            vec2 d = rot2(ang) * (l - 0.5);
            float zoom = 0.9 + 0.3 * clamp(audioSwell, 0.0, 1.0) * sin(0.3 * t + fi);
            vec2 uv = d * zoom * (0.9 + 0.06 * fi) + 0.5 + 0.1 * (hash22(vec2(fi, 1.0)) - 0.5);
            col = imgLod(uv, 0.5);
            float edge = smoothstep(0.0, 0.03, min(min(l.x, l.y), min(1.0 - l.x, 1.0 - l.y)) * s.z / 12.0);
            col *= 0.8 + 0.25 * edge;
        }
    }
    finish(col * 1.05);
}
