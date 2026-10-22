//@doc
 * @brief SCHWARZ CONTOUR SHELLS: the level surfaces of Schwarz' P function cos x + cos y + cos z as thin shells of
 * light at even steps -- a spatial contour map: round chambers where the function peaks, wide windows where it
 * saddles -- and the eye flies through shell after shell.  Each shell's distance is its value's gap over the
 * gradient.  One colour family from the photo, the shells shaded by depth.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the level the shells sit at wanders (integrated): chambers swell, windows open and close; and
 *                   the flight
 *   audioSpread  -> the shells' spacing: a broad spectrum packs them closer
 *   audioSwell   -> the shells' glow widens
 *
 * Knobs: stepP (the shells' base spacing), cellP (the lattice's size), hueP.
//@params stepP cellP
//@audio audioSpread audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float S = 1.1 + 0.6 * clamp(cellP, 0.0, 1.0);
    float sp = (1.0 + 0.5 * clamp(stepP, 0.0, 1.0)) * (1.15 - 0.3 * clamp(audioSpread, 0.0, 1.0));
    float iso = 0.8 * sin(0.21 * audioAdvance + 0.013 * sceneTime) + 0.4 * sin(0.13 * audioAdvance + 1.0);
    float width = 0.016 + 0.014 * clamp(audioSwell, 0.0, 1.0);
    float fly = 0.3 * sceneTime + 1.2 * audioAdvance;
    vec3 ro = vec3(0.6 * sin(0.04 * fly) + 1.2, 0.5 * cos(0.035 * fly) + 0.7, fly);
    vec3 rd = normalize(vec3(p, 1.1));
    rd.xz = rot2(0.3 * sin(0.022 * sceneTime)) * rd.xz;
    rd.yz = rot2(0.22 * sin(0.018 * sceneTime + 1.5)) * rd.yz;
    rd.xy = rot2(0.014 * sceneTime) * rd.xy;
    vec3 col = vec3(0.0);
    float t = 0.05;
    for (int i = 0; i < 110; ++i) {
        vec3 x = (ro + rd * t) / S;
        vec3 sn = sin(x);
        float f = cos(x.x) + cos(x.y) + cos(x.z);
        float gl = max(length(sn), 0.35);
        float u = (f - iso) / sp;
        float k = floor(u + 0.5);
        float d = abs(u - k) * sp / gl * S;
        float g = exp(-pow(d / width, 2.0)) + 0.01 * width * width / (width * width + d * d);
        float fade = exp(-0.2 * t) * smoothstep(0.05, 0.6, t);
        float shade = clamp(0.15 + 0.06 * t + 0.08 * k, 0.0, 1.0);
        col += famLight(fh, shade, 0.3 * exp(-pow(d / width, 2.0))) * g * fade * 0.1;
        t += clamp(0.6 * d, 0.015, 0.3);
        if (t > 18.0) break;
    }
    col += famCol(fh, 0.5) * 0.012;
    finish(col);
}
