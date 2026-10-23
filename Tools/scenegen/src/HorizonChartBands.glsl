//@doc
 * @brief HORIZON CHART BANDS: a horizon chart: the photo is shown as a series of time series in folded, coloured bands that lie on top of each other; where a value rises beyond a band, it is folded back and drawn again in a darker tone.  Twelve rows each follow one line of the
 * photo, and the depth of the folding glides steadily.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the fold depth (the number of bands)
 *   audioAdvance -> the series run through the rows (integrated)
 *
 * Knobs: sizeP (the number of rows), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
vec3 horizon(vec2 q, float rows, float nb, float t)
{
    float row = floor(q.y * rows);
    float fy = fract(q.y * rows);
    vec2 uv = vec2(q.x * 0.85 + 0.075 + 0.0 * t, (row + 0.5) / rows * 0.85 + 0.075);
    vec3 c = imgLod(uv + vec2(0.04 * sin(0.05 * t + row), 0.0), 2.0 + 0.2 * log2(rows));
    float v = clamp(luma(c) * 0.95, 0.0, 0.999) * nb;
    float jt = floor(v);
    float fr = fract(v);
    float j = fy < fr ? jt : jt - 1.0;
    float inten = (j + 1.0) / nb;
    vec3 tint = mix(vec3(luma(c)), c, 1.5);
    float edge = smoothstep(0.0, 0.06, fy) * (1.0 - smoothstep(0.94, 1.0, fy));
    return tint * (0.15 + 0.95 * inten) * (0.8 + 0.2 * edge);
}
void main()
{
    vec2 q = gl_FragCoord.xy / resolution;
    float rows = 8.0 + 8.0 * clamp(sizeP, 0.0, 1.0);
    float nbf = 2.0 + 4.0 * (0.5 + 0.5 * sin(0.05 * sceneTime + 1.5 * clamp(audioSwell, 0.0, 1.0)));
    float t = sceneTime + 4.0 * audioAdvance;
    float n0 = floor(nbf);
    float f = smoothstep(0.0, 1.0, fract(nbf));
    vec3 col = mix(horizon(q, rows, n0, t), horizon(q, rows, n0 + 1.0, t), f);
    finish(col * 1.1);
}
