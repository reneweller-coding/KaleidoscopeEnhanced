//@doc
 * @brief FLIPBOOK PAGE CASCADE: a flip book that pages through the photo: the pages fall as a wave across the picture, each page showing the photo in another deformation (zoom, turn, colour cast), and every page edge throws a soft shadow.  The wave runs steadily;
 * the page boundaries glide, and the photo behind each page stays in place.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the wave of pages runs on (integrated)
 *   audioSwell   -> the depth of the deformations
 *
 * Knobs: sizeP (the number of pages in view), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float N = 6.0 + 8.0 * clamp(sizeP, 0.0, 1.0);
    float ph = 0.05 * audioAdvance + 0.04 * sceneTime;
    float xn = (p.x / 1.78 + 0.5) * N + ph * N * 0.5 + 0.25 * sin(1.7 * p.y);
    float i = floor(xn);
    float fr = fract(xn);
    float dep = 0.5 + 0.5 * clamp(audioSwell, 0.0, 1.0);
    float zi = 1.0 + 0.2 * dep * sin(i * 0.9);
    float ri = 0.18 * dep * sin(i * 1.3 + 0.5);
    vec2 sh = 0.06 * dep * vec2(cos(i * 2.1), sin(i * 1.7));
    vec3 c = imgLod(rot2(ri) * p / zi * 0.85 + 0.5 + sh, 0.5);
    float h = 0.07 * i;
    c = mix(c, c.gbr, 0.18 * (0.5 + 0.5 * sin(i * 1.1)));
    c *= 0.9 + 0.1 * cos(h * 20.0);
    float curl = 0.78 + 0.28 * smoothstep(0.0, 0.7, fr);
    float edge = 1.0 - 0.5 * smoothstep(0.05, 0.0, fr);
    finish(c * curl * edge * 1.15);
}
