//@doc
 * @brief MUNSELL TREE CROSS SECTION: the Munsell tree: cylinder coordinates of hue, value and chroma with an irregular edge; the picture shows cross sections on which the photo's colours look for their place.  Two pages of the colour tree (a hue and its complement) stand side by side: value upwards, chroma outwards, the gamut's
 * edge is ragged and different for every hue, and the hue turns slowly; the photo gives a share of the colours.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the value of the page's lightest line (the brightness range)
 *   audioAdvance -> the hue turns (integrated)
 *
 * Knobs: sizeP (the chroma range), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    float hue = fract(0.01 * audioAdvance + 0.02 * sceneTime);
    float side = p.x < 0.0 ? 1.0 : 0.0;
    float h = fract(hue + 0.5 * side);
    float cx = abs(p.x) / (0.5 * asp) * 1.0;
    float val = p.y + 0.5;
    float cmax = 0.95 * pow(max(sin(3.1415927 * (0.15 + 0.7 * val)), 0.0), 0.7) * (0.7 + 0.3 * sin(6.2831853 * h * 3.0 + 1.0)) * (0.7 + 0.5 * clamp(sizeP, 0.0, 1.0));
    float chroma = cx;
    float inside = 1.0 - smoothstep(cmax - 0.01, cmax, chroma);
    float sat = clamp(chroma / max(cmax, 0.05), 0.0, 1.0);
    vec3 hs = hsv2rgb(vec3(h, sat * 0.95, val * (0.65 + 0.35 * clamp(audioSwell, 0.0, 1.0)) + 0.1));
    vec3 ph = imgLod(p * 0.85 + 0.5, 0.8);
    vec3 col = mix(hs, hs * (0.4 + ph), 0.35) * inside;
    float grid = (1.0 - smoothstep(0.0, 0.004, abs(fract(val * 10.0) - 0.5) - 0.495)) * 0.0;
    float axis = 1.0 - smoothstep(0.0, 0.004, abs(p.x));
    vec3 bg = ph * 0.1 + vec3(0.02);
    finish(mix(bg, col * 1.15, inside) + vec3(axis) * 0.4);
}
