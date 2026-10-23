//@doc
 * @brief SALT FLAT POLYGON RIDGES: salt pans: polygons of salt ridges that rise as the pan dries, with water between; the photo sets the colour of the salt and of the pools, and the polygons change their size.  A Voronoi net whose borders are white ridges of crystals; the cells are shallow pans that fill with
 * water (a mirror of the photo, tinted blue-green) as the level rises, and the ridges swell and shrink with the drying.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the water level (more swell, more water in the pans)
 *   audioSpread  -> the size of the polygons (smoothed)
 *
 * Knobs: sizeP (the size of the polygons), hueP.
//@params sizeP
//@audio audioSwell audioSpread
//@body
void main()
{
    vec2 p = screenP();
    float S = (0.12 + 0.1 * clamp(sizeP, 0.0, 1.0)) * (1.0 + 0.3 * clamp(audioSpread, 0.0, 1.0));
    vec2 g = p / S;
    vec2 gi = floor(g);
    float d1 = 1e3;
    float d2 = 1e3;
    vec2 best = vec2(0.0);
    vec2 bid = vec2(0.0);
    for (int dy = -1; dy <= 1; ++dy)
        for (int dx = -1; dx <= 1; ++dx) {
            vec2 cj = gi + vec2(float(dx), float(dy));
            vec2 h = hash22(cj);
            vec2 pt = cj + 0.5 + 0.4 * (h - 0.5) * 2.0;
            float d = length(g - pt);
            if (d < d1) { d2 = d1; d1 = d; best = pt; bid = cj; } else if (d < d2) d2 = d;
        }
    float web = d2 - d1;
    float lvl = 0.25 + 0.5 * clamp(audioSwell, 0.0, 1.0) + 0.1 * sin(0.04 * sceneTime);
    float depth = 0.6 + 0.4 * hash21(bid + 3.0);
    float ridge = 1.0 - smoothstep(0.03, 0.22 * (1.3 - lvl), web);
    float wet = smoothstep(0.0, 1.0, lvl * 2.0 * depth) * (1.0 - ridge);
    vec3 c = imgLod(p * 0.85 + 0.5, 0.8);
    vec3 pool = mix(vec3(0.15, 0.4, 0.45), c, 0.6) * (0.85 + 0.2 * sin(60.0 * p.x + 3.0 * sceneTime) * sin(50.0 * p.y));
    vec3 salt = mix(vec3(0.93, 0.92, 0.88), c, 0.2) * (0.9 + 0.2 * noise2(p * 200.0));
    vec3 pan = mix(salt * 0.9, pool, wet);
    vec3 col = mix(pan, salt * 1.05, ridge);
    finish(col * 1.1);
}
