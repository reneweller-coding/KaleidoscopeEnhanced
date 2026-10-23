//@doc
 * @brief KENTE STRIP WEAVE: kente strip weaving: narrow bands with patterns of their own are sewn side by side, each band with another repeat; the photo is cut into bands that run at different speeds.  Every band shows the photo at its own vertical offset, overlaid with a woven pattern (zigzag, check or
 * stripes), the weft threads run across, and the bands' widths follow the music slowly.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the bands run at their own speeds (integrated)
 *   audioSwell   -> the width of the bands breathes
 *
 * Knobs: sizeP (the number of bands), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    float N = 8.0 + 10.0 * clamp(sizeP, 0.0, 1.0);
    float xw = p.x / asp + 0.5;
    xw += 0.012 * sin(0.7 * sceneTime + 6.0 * xw) * (0.5 + clamp(audioSwell, 0.0, 1.0));
    float k = floor(xw * N);
    float fx = fract(xw * N);
    float h = hash21(vec2(k, 5.0));
    float spd = (h - 0.5) * 2.0;
    float off = spd * (0.02 * audioAdvance + 0.03 * sceneTime);
    vec3 c = imgLod(vec2(p.x * 0.85 + 0.5 + 0.1 * (h - 0.5), p.y * 0.85 + 0.5 + off), 0.6);
    float typ = floor(h * 3.0);
    float py = (p.y + 0.5 - off * 2.0) * 14.0;
    float pat;
    if (typ < 0.5) pat = smoothstep(0.35, 0.65, abs(fract(py) - 0.5) * 2.0 - abs(fx - 0.5) * 2.0 * 0.0 + (fx - 0.5) * (mod(floor(py), 2.0) - 0.5) * 2.0 * 0.5);
    else if (typ < 1.5) pat = abs(mod(floor(py) + floor(fx * 4.0), 2.0));
    else pat = smoothstep(0.3, 0.7, 0.5 + 0.5 * sin(6.2831853 * py * 0.7));
    float weft = 0.85 + 0.15 * sin(gl_FragCoord.y * 3.0 * resolution.y / 270.0 * 0.5);
    float gap = smoothstep(0.0, 0.06, fx) * (1.0 - smoothstep(0.94, 1.0, fx));
    vec3 col = mix(c * 0.55, c * 1.3, pat) * weft;
    col = mix(vec3(0.05, 0.03, 0.02), col, gap);
    finish(col * 1.1);
}
