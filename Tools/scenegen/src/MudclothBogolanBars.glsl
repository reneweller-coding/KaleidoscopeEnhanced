//@doc
 * @brief MUDCLOTH BOGOLAN BARS: bogolan: stripes and signs of mud dye on cotton with white joints; in the picture bars of dark tone run with a fine drawing from the photo, and their white space breathes.  The marks are cream-coloured dots and dashes whose density follows the brightness of the photo,
 * set in cells of a few pixels, in the dark mud bars between pale cotton.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the width of the white space between the bars
 *   audioAdvance -> the marks drift slowly (integrated)
 *
 * Knobs: sizeP (the number of bars), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 fc = gl_FragCoord.xy;
    float px = resolution.y / 270.0;
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    float N = 5.0 + 7.0 * clamp(sizeP, 0.0, 1.0);
    float xw = p.x / asp + 0.5;
    float k = floor(xw * N);
    float fx = fract(xw * N);
    float wsp = 0.12 + 0.2 * clamp(audioSwell, 0.0, 1.0) + 0.04 * sin(0.2 * sceneTime + k);
    float bar = smoothstep(wsp, wsp + 0.03, fx) * (1.0 - smoothstep(1.0 - wsp - 0.03, 1.0 - wsp, fx));
    float cell = 3.2 * px;
    vec2 g = floor((fc + vec2(0.0, 0.4 * (0.05 * audioAdvance + 0.04 * sceneTime) * 40.0 * px)) / cell);
    vec3 c = imgLod(p * 0.85 + 0.5, 0.8);
    float l = luma(c);
    float hh = hash21(g + k * 13.0);
    float mark = smoothstep(hh - 0.1, hh + 0.1, l * l * 1.15);
    float band = 0.5 + 0.5 * sin(p.y * 40.0 + 3.0 * k);
    vec3 mud = vec3(0.1, 0.065, 0.04) + vec3(0.02) * noise2(fc / px * 0.3);
    vec3 cream = mix(vec3(0.92, 0.86, 0.7), c, 0.2);
    vec3 col = mix(mud, cream, mark * 0.9);
    vec3 cotton = vec3(0.93, 0.9, 0.82) * (0.92 + 0.08 * noise2(fc / px * 0.6));
    finish(mix(cotton, col, bar) * 1.05);
}
