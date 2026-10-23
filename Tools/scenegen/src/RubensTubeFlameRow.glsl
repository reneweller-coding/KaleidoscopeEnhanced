//@doc
 * @brief RUBENS TUBE FLAME ROW: the Rubens tube: a row of flames above a tube in which a sound wave stands, whose heights draw the wave; the picture is a row of luminous tongues on which the photo runs as colour, and the heights follow the modes.  Forty flames, each as tall as the pressure at its place; the
 * photo colours the flames and the haze above them.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the mode glides with the key (integrated)
 *   audioSwell       -> the height of the flames
 *
 * Knobs: sizeP (the number of flames), hueP.
//@params sizeP
//@audio audioSwell audioHarmAdvance
//@body
void main()
{
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    float N = 28.0 + 24.0 * clamp(sizeP, 0.0, 1.0);
    float y0 = -0.34;
    float xn = (p.x / asp + 0.5);
    float i = floor(xn * N);
    float fx = fract(xn * N) - 0.5;
    float xc = (i + 0.5) / N;
    float mode = 2.0 + 3.5 * (0.5 + 0.5 * sin(0.08 * audioHarmAdvance + 0.03 * sceneTime));
    float press = abs(cos(3.1415927 * mode * xc + 0.4 * sin(0.2 * sceneTime)));
    float H = (0.1 + 0.55 * press) * (0.55 + 0.6 * clamp(audioSwell, 0.0, 1.0));
    float flick = 0.04 * sin(3.0 * sceneTime + 9.0 * i) + 0.03 * noise2(vec2(i, 2.0 * sceneTime));
    H *= 1.0 + flick;
    float y = p.y - y0;
    float u = clamp(y / H, 0.0, 1.0);
    float wd = 0.62 * (1.0 - pow(u, 1.2)) * (0.6 + 0.4 * (1.0 - u));
    float wob = 0.12 * sin(8.0 * u - 4.0 * sceneTime + i) * u;
    float inside = (1.0 - smoothstep(wd - 0.1, wd, abs(fx + wob))) * step(0.0, y) * (1.0 - smoothstep(0.97, 1.0, y / max(H, 1e-3)));
    vec3 c = imgLod(vec2(p.x * 0.85 / asp * 1.0 + 0.5, p.y * 0.85 + 0.5), 0.8);
    vec3 hot = mix(c * 1.3, vec3(1.0, 0.75, 0.35), 0.35 * (1.0 - u));
    vec3 col = imgLod(p * 0.85 + 0.5, 2.5) * 0.12;
    float haze = exp(-max(y, 0.0) * 4.0) * (0.25 + 0.5 * press) * step(0.0, y) * 0.5;
    col += c * haze * 0.6;
    col = mix(col, hot * 1.3, inside);
    float tube = smoothstep(0.0, 0.012, y0 - p.y) * smoothstep(0.1, 0.0, y0 - p.y - 0.02);
    col += vec3(0.25, 0.22, 0.2) * tube * (0.5 + 0.5 * step(0.5, abs(fx) * 0.0 + 0.6));
    finish(col);
}
