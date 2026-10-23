//@doc
 * @brief LIMPET SHELL GROWTH LINES: limpets: growth lines in concentric bands, with radial ribs; the photo shows in the zones of different years, and the bands grow.  A cone seen from above: bands whose width follows a slow rhythm (good and bad years), a rib every few degrees that is raised at the lines, and a
 * conical shading; the photo is read at the radius of each band.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the width of the bands breathes
 *   audioAdvance -> the shell grows outwards (the bands run outward) (integrated)
 *
 * Knobs: sizeP (the number of ribs), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float r = length(p) + 1e-4;
    float th = atan(p.y, p.x);
    float g = 0.01 * audioAdvance + 0.015 * sceneTime;
    float K = 14.0 + 6.0 * clamp(audioSwell, 0.0, 1.0);
    float u = r * K - g + 0.5 * sin(5.0 * r * K * 0.3) * 0.5;
    float band = floor(u);
    float fb = fract(u);
    float nr = 18.0 + 30.0 * clamp(sizeP, 0.0, 1.0);
    float rib = 0.5 + 0.5 * cos(nr * th + 0.3 * sin(band));
    float line = smoothstep(0.0, 0.1, fb) * (1.0 - smoothstep(0.0, 0.35, 1.0 - fb) * 0.0);
    float edge = 1.0 - smoothstep(0.0, 0.12, fb);
    float cone = 1.0 - 0.55 * smoothstep(0.0, 0.65, r);
    vec2 pr = rot2(0.05 * band) * p;
    vec3 c = imgLod(pr * 0.85 + 0.5 + 0.0, 0.8);
    c = mix(vec3(luma(c)), c, 1.3);
    float tone = 0.65 + 0.4 * mod(band, 2.0) * 0.5;
    vec3 col = c * tone * (0.7 + 0.45 * rib) * cone * 1.25;
    col = mix(col, vec3(0.9, 0.85, 0.75) * luma(c), edge * 0.5);
    finish(col);
}
