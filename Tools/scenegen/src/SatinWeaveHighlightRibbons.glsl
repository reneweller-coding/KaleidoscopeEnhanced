//@doc
 * @brief SATIN WEAVE HIGHLIGHT RIBBONS: satin: long thread floats that mirror the light in bands; the photo colours the bands, and the ribbons of light run crosswise through the surface.  Fine vertical threads in long floats with a rare binding point, a broad cosine of light across the surface that moves, and the sheen
 * tinted with the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the width of the ribbons of light
 *   audioAdvance -> the ribbons run (integrated)
 *
 * Knobs: sizeP (the fineness of the threads), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float W = 0.006 + 0.008 * clamp(sizeP, 0.0, 1.0);
    vec2 g = p / W;
    vec2 ci = floor(g);
    vec2 f = fract(g);
    float t = 0.02 * audioAdvance + 0.035 * sceneTime;
    float h = hash21(vec2(ci.x, 1.0));
    float bind = step(0.93, hash21(vec2(ci.x, floor(g.y / 5.0))));
    float cyl = sqrt(max(1.0 - pow(2.0 * f.x - 1.0, 2.0), 0.0));
    float wd = 0.4 + 0.8 * clamp(audioSwell, 0.0, 1.0);
    float ribbon = 0.0;
    for (int k = 0; k < 3; ++k) {
        float fk = float(k);
        float c0 = 0.7 * sin(t * (0.7 + 0.3 * fk) + 2.0 * fk);
        float u = (dot(p, vec2(0.7, 0.7)) - c0) / (0.12 * wd);
        ribbon += exp(-u * u);
    }
    vec3 c = imgLod(p * 0.85 + 0.5, 1.2);
    c = mix(vec3(luma(c)), c, 1.4);
    vec3 base = c * (0.35 + 0.35 * cyl) * (0.9 + 0.2 * h);
    vec3 sheen = mix(vec3(1.0, 0.95, 0.9), c * 1.7, 0.55) * ribbon * (0.4 + 0.9 * cyl) * (1.0 - 0.5 * bind);
    vec3 col = base + sheen * 1.0;
    col *= 1.0 - 0.35 * bind;
    finish(col * 1.2);
}
