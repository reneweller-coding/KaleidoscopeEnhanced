//@doc
 * @brief RADAR CHART POLYGON BREATH: radar charts: the photo is divided into twelve sectors whose means form a polygon; many polygons on top of each other (for parts of the photo) breathe with their measured values.  Each polygon carries the mean colour of its part of the photo, and the
 * spokes behind them give a web of rings and rays.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the windows of the photo slide, so the polygons change shape (integrated)
 *   audioSwell       -> the breathing of the polygons
 *
 * Knobs: sizeP (the size of the polygons), hueP.
//@params sizeP
//@audio audioSwell audioHarmAdvance
//@body
void main()
{
    vec2 p = screenP();
    float r = length(p);
    float a = atan(p.y, p.x);
    vec3 col = imgLod(p * 0.85 + 0.5, 2.5) * 0.2;
    float web = 0.0;
    for (int i = 1; i <= 4; ++i)
        web += 1.0 - smoothstep(0.0, 0.004, abs(r - 0.1 * float(i) * (0.8 + 0.4 * clamp(sizeP, 0.0, 1.0))));
    web += (1.0 - smoothstep(0.0, 0.01, abs(fract(a / 6.2831853 * 12.0 + 0.5) - 0.5) * r)) * smoothstep(0.5, 0.3, r);
    col += vec3(0.5, 0.55, 0.6) * web * 0.18;
    float u = a / 6.2831853 * 12.0;
    float k0 = floor(u);
    float fk = fract(u);
    float Rs = 0.22 + 0.2 * clamp(sizeP, 0.0, 1.0);
    float br = 0.8 + 0.4 * clamp(audioSwell, 0.0, 1.0);
    for (int m = 0; m < 5; ++m) {
        float fm = float(m);
        vec2 win = 0.5 + 0.22 * vec2(sin(0.13 * audioHarmAdvance + 1.7 * fm), cos(0.11 * audioHarmAdvance + 2.3 * fm));
        float v0 = 0.0;
        float v1 = 0.0;
        for (int j = 0; j < 2; ++j) {
            float kk = mod(k0 + float(j), 12.0);
            float ang = (kk + 0.5) / 12.0 * 6.2831853;
            vec3 c = imgLod(win + 0.1 * vec2(cos(ang), sin(ang)), 2.0);
            float v = luma(c);
            if (j == 0) v0 = v; else v1 = v;
        }
        float v = mix(v0, v1, fk);
        float Rm = Rs * (0.5 + 1.1 * v) * br * (0.55 + 0.12 * fm);
        vec3 cm = imgLod(win, 3.0);
        cm = mix(vec3(luma(cm)), cm, 1.4);
        float fill = 1.0 - smoothstep(Rm - 0.004, Rm, r);
        float line = 1.0 - smoothstep(0.0, 0.004, abs(r - Rm));
        col = mix(col, cm, fill * 0.22);
        col = mix(col, cm * 1.4, line * 0.85);
    }
    finish(col * 1.15);
}
