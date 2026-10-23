//@doc
 * @brief CALENDAR HEATMAP WEAVE: a calendar heat map: the rows are weekdays, the columns weeks, and the cells show the photo in stripes by brightness; the weave winds like a coil spring across the surface in days, each weekday shifted against the one before.  The length of the week
 * glides, so the cells stretch slowly.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos -> the length of a week breathes once a phrase (periodic)
 *   audioAdvance   -> the coil runs along (integrated)
 *
 * Knobs: sizeP (the number of weeks in view), hueP.
//@params sizeP
//@audio audioAdvance audioPhrasePos
//@body
void main()
{
    vec2 q = gl_FragCoord.xy / resolution;
    float W = 14.0 + 16.0 * clamp(sizeP, 0.0, 1.0);
    W *= 1.0 + 0.18 * sin(6.2831853 * audioPhrasePos);
    float rows = 7.0;
    float ry = q.y * rows;
    float r = floor(ry);
    float fy = fract(ry);
    float shear = 0.14 * r + 0.02 * audioAdvance + 0.03 * sceneTime;
    float cx = q.x * W + shear * W * 0.5;
    float c = floor(cx);
    float fx = fract(cx);
    vec2 cen = vec2((c + 0.5 - shear * W * 0.5) / W, (r + 0.5) / rows);
    vec3 ph = imgLod((cen - 0.5) * vec2(resolution.x / resolution.y, 1.0) * 0.85 + 0.5, 1.5);
    float l = luma(ph);
    float bars = 3.0;
    float bi = floor(fx * bars);
    float bf = fract(fx * bars);
    float thr = (bi + 0.5) / bars;
    float fill = smoothstep(thr - 0.2, thr + 0.2, l * 1.05);
    float bar = smoothstep(0.0, 0.12, bf) * (1.0 - smoothstep(0.88, 1.0, bf)) * smoothstep(0.08, 0.2, fy) * (1.0 - smoothstep(0.8, 0.92, fy));
    vec3 col = mix(vec3(0.05), ph * 1.3, fill * bar);
    col += vec3(0.1) * (1.0 - fill) * bar;
    finish(col);
}
