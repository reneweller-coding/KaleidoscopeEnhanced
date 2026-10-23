//@doc
 * @brief POISSON DISK GROWING STIPPLE: Poisson discs: points with a minimum distance fill the surface evenly; the photo sets the minimum distance (light: wide, dark: close), and the discs grow until they touch.  A jittered net of discs whose largest radius depends on the brightness grows from nothing to full size and
 * back with the music; every disc takes the photo's colour at its centre.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the degree of growth (the radius against the full size)
 *   audioSpread  -> the scale of the net (smoothed)
 *
 * Knobs: sizeP (the size of the cells), hueP.
//@params sizeP
//@audio audioSwell audioSpread
//@body
void main()
{
    vec2 p = screenP();
    float S = (0.03 + 0.03 * clamp(sizeP, 0.0, 1.0)) * (1.0 + 0.3 * clamp(audioSpread, 0.0, 1.0));
    vec2 g = p / S;
    vec2 gi = floor(g);
    float grow = 0.35 + 0.6 * clamp(audioSwell, 0.0, 1.0) + 0.05 * sin(0.1 * sceneTime);
    vec3 col = vec3(0.04);
    float best = 1e3;
    for (int dy = -1; dy <= 1; ++dy)
        for (int dx = -1; dx <= 1; ++dx) {
            vec2 cj = gi + vec2(float(dx), float(dy));
            vec2 h = hash22(cj);
            vec2 pt = cj + 0.5 + 0.28 * (h - 0.5) * 2.0;
            vec3 c = imgLod(pt * S * 0.85 + 0.5, 1.3);
            float l = luma(c);
            float R = (0.2 + 0.32 * l) * grow;
            float d = length(g - pt) / R;
            if (d < 1.0 && d < best) {
                best = d;
                vec3 cc = mix(vec3(luma(c)), c, 1.4);
                float lit = 0.6 + 0.5 * (1.0 - d * d);
                col = cc * lit * 1.2;
            }
        }
    finish(col);
}
