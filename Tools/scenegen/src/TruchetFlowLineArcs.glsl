//@doc
 * @brief TRUCHET FLOW LINE ARCS: flow lines from Truchet arcs: quarter circles in tiles that join up to flowing lines; the photo sets the orientation, and the lines run along the tiles.  Every tile has two quarter arcs; which diagonal they join is chosen by the photo's brightness at the tile against a slowly moving
 * threshold, with a soft change between the two, and light pulses run along the arcs.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread  -> the size of the tiles (smoothed)
 *   audioAdvance -> the pulses run along the lines and the threshold moves (integrated)
 *
 * Knobs: sizeP (the size of the tiles), hueP.
//@params sizeP
//@audio audioSpread audioAdvance
//@body
float arcD(vec2 f, float o)
{
    vec2 g = o < 0.5 ? f : vec2(1.0 - f.x, f.y);
    float d1 = abs(length(g) - 0.5);
    float d2 = abs(length(g - vec2(1.0)) - 0.5);
    return min(d1, d2);
}
void main()
{
    vec2 p = screenP();
    float S = (0.08 + 0.07 * clamp(sizeP, 0.0, 1.0)) * (1.0 + 0.25 * clamp(audioSpread, 0.0, 1.0));
    vec2 g = p / S;
    vec2 ci = floor(g);
    vec2 f = fract(g);
    float thr = 0.5 + 0.2 * sin(0.03 * audioAdvance + 0.04 * sceneTime);
    float l = luma(imgLod((ci + 0.5) * S * 0.85 + 0.5, 2.0)) + 0.18 * (hash21(ci) - 0.5);
    float o = smoothstep(thr - 0.06, thr + 0.06, l);
    float dA = arcD(f, 0.0);
    float dB = arcD(f, 1.0);
    float w = 0.07;
    float lineA = 1.0 - smoothstep(w * 0.6, w, dA);
    float lineB = 1.0 - smoothstep(w * 0.6, w, dB);
    float line = mix(lineA, lineB, o);
    vec3 c = imgLod(p * 0.85 + 0.5, 0.8);
    c = mix(vec3(luma(c)), c, 1.4);
    float run = sin(6.2831853 * (3.0 * (f.x + f.y) * 0.0 + atan(f.y - 0.5, f.x - 0.5) * 1.0 / 6.2831853 * 3.0 - 0.05 * audioAdvance * 3.0 - 0.1 * sceneTime));
    vec3 bg = imgLod(p * 0.85 + 0.5, 2.0) * 0.15;
    vec3 col = bg + c * line * (1.2 + 0.4 * run);
    finish(col);
}
