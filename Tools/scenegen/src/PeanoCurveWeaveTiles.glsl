//@doc
 * @brief PEANO CURVE WEAVE TILES: the Peano curve: a curve that divides a square into nine parts and runs through all of them in serpentine lines; the picture shows the photo in stripes that follow the curve and get finer with every level, with a wandering number of levels.  Every pixel finds its place
 * on the curve through the base-three digits of its position, and the photo is read along the curve like a ribbon.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell       -> the number of levels glides (the levels are cross-faded)
 *   audioAdvance     -> the ribbon slides along the curve (integrated)
 *
 * Knobs: sizeP (the size of the square), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
float peano(vec2 q, int L)
{
    float idx = 0.0;
    float sc = 1.0;
    bool fx = false;
    bool fy = false;
    for (int k = 0; k < 6; ++k) {
        if (k >= L) break;
        vec2 g = clamp(floor(q * 3.0), 0.0, 2.0);
        vec2 f = q * 3.0 - g;
        float cx = g.x;
        float cy = g.y;
        if (fx) cx = 2.0 - cx;
        if (fy) cy = 2.0 - cy;
        float d = cx * 3.0 + (mod(cx, 2.0) > 0.5 ? 2.0 - cy : cy);
        sc /= 9.0;
        idx += d * sc * 9.0 / 9.0;
        bool oddx = mod(cx, 2.0) > 0.5;
        bool oddy = mod(cy, 2.0) > 0.5;
        if (oddx) fy = !fy;
        if (oddy) fx = !fx;
        q = f;
        sc = sc;
        idx = idx;
    }
    return idx;
}
void main()
{
    vec2 p = screenP();
    float S = 1.0 + 0.4 * clamp(sizeP, 0.0, 1.0);
    vec2 q = clamp(vec2(p.x / (S * 0.9) * 0.5625 + 0.5, p.y / (S * 0.9) + 0.5), 0.001, 0.999);
    float lf = 2.0 + 3.0 * (0.5 + 0.5 * sin(0.04 * sceneTime + 1.5 * clamp(audioSwell, 0.0, 1.0)));
    int l0 = int(floor(lf));
    float f = smoothstep(0.0, 1.0, fract(lf));
    float a = peano(q, l0);
    float b = peano(q, l0 + 1);
    float t = mix(a, b, f);
    float slide = 0.01 * audioAdvance + 0.02 * sceneTime;
    vec2 uv = vec2(fract(t * 3.0 + slide), 0.5 + 0.35 * sin(6.2831853 * t * 1.0 + 0.5 * slide));
    vec3 c = imgLod(uv * 0.8 + 0.1, 0.8);
    vec3 pc = imgLod(p * 0.85 + 0.5, 1.5);
    vec3 col = mix(c, pc, 0.25);
    float edge = 0.85 + 0.15 * cos(60.0 * t);
    finish(col * edge * 1.15);
}
