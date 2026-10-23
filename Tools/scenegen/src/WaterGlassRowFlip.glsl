//@doc
 * @brief WATER GLASS ROW FLIP: a row of glasses filled with water acts as cylinder lenses: in every glass the photo stands mirrored, and the fill height, the place of the glasses and the
 * distance to the photo keep changing: above the water line the picture is plain, below it flipped and enlarged.  Several rows run down the screen.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the glasses' fill height
 *   audioAdvance    -> the distance to the photo (the enlargement) and the glasses' slide (integrated)
 *
 * Knobs: glassesP (how many glasses), hueP.
//@params glassesP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float t = 0.03 * sceneTime + 0.25 * audioAdvance;
    float N = 4.0 + 5.0 * clamp(glassesP, 0.0, 1.0);
    float row = floor(p.y * 2.0 + 1.0);
    float x = p.x * N * 0.6 + 0.3 * t * (mod(row, 2.0) < 0.5 ? 1.0 : -1.0);
    float i = floor(x);
    float f = fract(x) - 0.5;
    float fill = 0.3 + 0.5 * clamp(audioSwell, 0.0, 1.0) * (0.6 + 0.4 * hash21(vec2(i, row))) + 0.1 * sin(t + i);
    float yloc = fract(p.y * 2.0 + 1.0);
    float water = smoothstep(fill, fill - 0.04, yloc);
    float inside = smoothstep(0.5, 0.42, abs(f));
    float mag = 1.2 + 0.9 * (0.5 + 0.5 * sin(0.5 * t + i));
    vec2 flip = vec2(0.5 + (0.5 - uv.x) * mag * 0.0 + (-(f) * 0.3 * mag) - 0.0, uv.y);
    vec2 uvf = vec2(uv.x - 2.0 * f / (N * 0.6) * 0.8 * 0.5 + 0.0, uv.y);
    uvf.x = uv.x + (-2.0 * f / (N * 0.6)) * 0.8 + 0.0;
    vec3 plain = imgLod(uv, 0.5);
    vec3 flipped = imgLod(vec2(uvf.x, 0.5 + (uv.y - 0.5) * 0.9), 0.5) * 1.05;
    vec3 col = mix(plain, flipped, water * inside);
    col *= 1.0 - 0.3 * smoothstep(0.42, 0.5, abs(f)) * inside;
    col += 0.06 * inside * smoothstep(0.1, 0.0, abs(yloc - fill));
    finish(col * 1.05);
}
