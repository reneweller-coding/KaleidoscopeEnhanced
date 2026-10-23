//@doc
 * @brief CEPSTRUM RAHMONIC STRIPES: the cepstrum: the periodicities in the spectrum of each row show up as stripes ("rahmonics"); the photo turns into rows of stripes that correspond to its row structure.  For every row the self-similarity along the row is shown against the offset,
 * which is the horizontal axis; the rows run through the photo and the stripes' brightness is the match.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the stripe frequency glides (integrated)
 *   audioAdvance     -> the rows run through the photo
 *
 * Knobs: sizeP (the height of a row), hueP.
//@params sizeP
//@audio audioAdvance audioHarmAdvance
//@body
void main()
{
    vec2 q = gl_FragCoord.xy / resolution;
    float rows = 14.0 + 22.0 * (1.0 - clamp(sizeP, 0.0, 1.0));
    float row = floor(q.y * rows);
    float fy = fract(q.y * rows);
    float yph = (row + 0.5) / rows;
    float ry = 0.5 + (yph - 0.5) * 0.8 + 0.05 * sin(0.02 * audioAdvance + 0.04 * sceneTime + 0.3 * row);
    float lagmax = 0.25 * (1.0 + 0.4 * sin(0.04 * audioHarmAdvance + 0.03 * sceneTime));
    float lag = q.x * lagmax;
    float acc = 0.0;
    float e0 = 0.0;
    float e1 = 0.0;
    vec3 cs = vec3(0.0);
    for (int k = 0; k < 14; ++k) {
        float x = 0.1 + 0.8 * (float(k) + 0.5) / 14.0 * 0.75;
        vec3 a = imgLod(vec2(x, ry), 1.2);
        vec3 b = imgLod(vec2(x + lag, ry), 1.2);
        float la = luma(a) - 0.5;
        float lb = luma(b) - 0.5;
        acc += la * lb;
        e0 += la * la;
        e1 += lb * lb;
        cs += b;
    }
    float r = acc / sqrt(max(e0 * e1, 1e-4));
    cs /= 14.0;
    float v = smoothstep(-0.2, 0.9, r);
    vec3 col = mix(vec3(0.03), cs * 1.4, v) + hsv2rgb(vec3(fract(0.55 + 0.4 * r), 0.7, 0.4)) * smoothstep(0.5, 1.0, r) * 0.5;
    float edge = smoothstep(0.0, 0.08, fy) * (1.0 - smoothstep(0.92, 1.0, fy));
    finish(col * (0.5 + 0.5 * edge) * 1.1);
}
