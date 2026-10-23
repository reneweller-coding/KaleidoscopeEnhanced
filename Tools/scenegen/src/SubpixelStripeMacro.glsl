//@doc
 * @brief SUBPIXEL STRIPE MACRO: the photo as a macro lens sees it on a liquid-crystal display: every picture point is a triple of red, green and blue stripes with black between, the magnification wanders from pixel to a whole picture and back, and at
 * every step another moiré of the stripes with the photo's own structure appears.  The stripes are slightly tilted, and the tilt turns with the harmony.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance      -> the magnification wanders (integrated)
 *   audioHarmAdvance  -> the tilt of the stripes
 *
 * Knobs: sizeP (the slowest magnification), hueP.
//@params sizeP
//@audio audioAdvance audioHarmAdvance
//@body
void main()
{
    vec2 fc = gl_FragCoord.xy - 0.5 * resolution;
    float lp = mix(1.9, 2.8, clamp(sizeP, 0.0, 1.0));
    float P = exp(mix(1.6, lp + 0.8, 0.5 + 0.5 * sin(0.05 * sceneTime + 0.04 * audioAdvance)));
    P = max(P, 4.0);
    float Pb = P;
    P *= resolution.y / 270.0;
    float ang = 0.12 * sin(0.2 * audioHarmAdvance) + 0.03 * sin(0.07 * sceneTime);
    vec2 r = rot2(ang) * fc;
    float fx = r.x / P;
    float ix = floor(fx);
    float fr = fract(fx);
    int ch = int(floor(fr * 3.0));
    float sx = fract(fr * 3.0);
    float stripe = smoothstep(0.0, 0.18, sx) * (1.0 - smoothstep(0.82, 1.0, sx));
    float iy = floor(r.y / (P * 1.0));
    float fy = fract(r.y / P);
    float rowm = smoothstep(0.0, 0.1, fy) * (1.0 - smoothstep(0.88, 1.0, fy));
    vec2 pc = vec2((ix + 0.5) * P, (iy + 0.5) * P);
    vec3 c = imgLod(rot2(-ang) * pc / resolution.y * 0.8 + 0.5, log2(max(Pb, 1.0)) - 0.5);
    vec3 glow = imgLod(fc / resolution.y * 0.8 + 0.5, log2(max(Pb, 1.0)));
    float v = ch == 0 ? c.r : (ch == 1 ? c.g : c.b);
    vec3 m = ch == 0 ? vec3(1.0, 0.1, 0.05) : (ch == 1 ? vec3(0.1, 1.0, 0.15) : vec3(0.1, 0.25, 1.0));
    vec3 col = m * v * stripe * rowm * 1.5 + glow * 0.2;
    finish(col);
}
