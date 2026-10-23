//@doc
 * @brief VIOLIN FLUTTER FIELD: a field of violin plots: strips of the distribution of brightness in the photo, mirrored, as slender violins that bend wavily with the shift of the window.  Each violin belongs to a column of the photo and shows how its brightness values are spread
 * (sixteen samples, smoothed into a density); the violins take the mean colour of their column.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the window of the photo shifts (integrated), and the violins' bending runs on
 *   audioSwell   -> the width of the violins
 *
 * Knobs: sizeP (the number of violins), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 q = gl_FragCoord.xy / resolution;
    float asp = resolution.x / resolution.y;
    float n = 7.0 + 7.0 * clamp(sizeP, 0.0, 1.0);
    float t = 0.04 * audioAdvance + 0.03 * sceneTime;
    float bend = 0.18 * sin(6.0 * q.y + 3.0 * t) / n;
    float cx = (q.x + bend) * n;
    float c = floor(cx);
    float fx = fract(cx) - 0.5;
    float xc = (c + 0.5) / n;
    float val = q.y;
    float dens = 0.0;
    vec3 mean = vec3(0.0);
    for (int k = 0; k < 16; ++k) {
        float yk = (float(k) + 0.5) / 16.0;
        vec3 col = imgLod(vec2(xc * 0.85 + 0.075 + 0.05 * sin(t + c), yk * 0.85 + 0.075 + 0.04 * sin(0.7 * t + 0.5 * c)), 2.3);
        float v = luma(col);
        float d = (val - v) / 0.09;
        dens += exp(-d * d);
        mean += col;
    }
    mean /= 16.0;
    dens /= 4.0;
    float hw = (0.12 + 0.3 * clamp(audioSwell, 0.0, 1.0)) * dens;
    float inside = 1.0 - smoothstep(hw - 0.02, hw, abs(fx));
    vec3 bg = imgLod(vec2(q.x, q.y) * 0.85 + 0.075, 2.5) * 0.12;
    vec3 body = mix(vec3(luma(mean)), mean, 1.4) * (0.6 + 0.6 * dens);
    float rim = smoothstep(0.03, 0.0, abs(abs(fx) - hw));
    vec3 col = mix(bg, body * 1.2, inside);
    col += rim * 0.2;
    finish(col);
}
