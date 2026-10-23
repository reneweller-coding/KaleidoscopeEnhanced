//@doc
 * @brief LED DIFFUSER BLOOM: an LED wall behind a diffusing sheet: the photo lies in a coarse resolution, every LED shines softly into its neighbours, and the thickness of the sheet glides, so the picture breathes between a lattice of points and a soft blur.
 * With a thin sheet the single lamps stand out, with a thick one they melt into each other.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the sheet's thickness (more swell, softer)
 *   audioAdvance -> the lamp grid slides over the picture (integrated)
 *
 * Knobs: sizeP (the lamp pitch), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 fc = gl_FragCoord.xy;
    float Pb = 12.0 + 22.0 * clamp(sizeP, 0.0, 1.0);
    float P = Pb * resolution.y / 270.0;
    vec2 o = P * vec2(sin(0.01 * audioAdvance + 0.02 * sceneTime), cos(0.008 * audioAdvance)) * 2.0;
    vec2 g = (fc + o) / P;
    vec2 ci = floor(g);
    float sg = P * (0.2 + 0.35 * (0.5 + 0.5 * sin(0.07 * sceneTime)) + 0.25 * clamp(audioSwell, 0.0, 1.0));
    vec3 sum = vec3(0.0);
    float ws = 0.0;
    for (int dy = -2; dy <= 2; ++dy)
        for (int dx = -2; dx <= 2; ++dx) {
            vec2 cj = ci + vec2(float(dx), float(dy));
            vec2 pc = (cj + 0.5) * P - o;
            vec2 d = fc - pc;
            float w = exp(-dot(d, d) / (2.0 * sg * sg));
            vec3 c = imgLod((pc - 0.5 * resolution) / resolution.y * 0.8 + 0.5, log2(Pb) - 0.3);
            sum += c * w;
            ws += w;
        }
    vec3 col = sum / max(1.0, ws);
    finish(col * 1.0);
}
