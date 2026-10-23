//@doc
 * @brief EYE DIAGRAM HARMONICS: eye diagrams: the course of every picture row is laid over itself many times, folded with the period of the clock, so that an "eye" arises where the signal orders itself; the photo forms rows of eyes that open and close.  Ten periods of each
 * row's brightness are drawn as traces in the colour of the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the folded period glides (integrated)
 *   audioSwell   -> the opening of the eyes
 *
 * Knobs: sizeP (the number of rows), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 q = gl_FragCoord.xy / resolution;
    float rows = 5.0 + 6.0 * clamp(sizeP, 0.0, 1.0);
    float row = floor(q.y * rows);
    float fy = fract(q.y * rows);
    float P = 0.045 + 0.02 * sin(0.03 * audioAdvance + 0.04 * sceneTime);
    float phi = fract(q.x / (3.0 * P));
    float open = 0.7 + 0.5 * clamp(audioSwell, 0.0, 1.0);
    vec3 acc = vec3(0.0);
    float tot = 0.0;
    for (int k = 0; k < 10; ++k) {
        float x = (float(k) + phi) * P + 0.02 * sin(0.2 * row + 0.05 * sceneTime);
        vec3 c = imgLod(vec2(x * 0.85 + 0.075, (row + 0.5) / rows * 0.85 + 0.075), 1.6);
        float v = 0.5 + (luma(c) - 0.5) * open;
        float d = (fy - clamp(v * 0.8 + 0.1, 0.05, 0.95)) / 0.035;
        float w = exp(-d * d);
        acc += c * w;
        tot += w;
    }
    vec3 base = imgLod(vec2(q.x, q.y) * 0.85 + 0.075, 2.5) * 0.15;
    vec3 col = base + acc * 0.9;
    float eyeline = smoothstep(0.0, 0.03, fy) * (1.0 - smoothstep(0.97, 1.0, fy));
    finish(col * (0.6 + 0.4 * eyeline) * 1.15);
}
