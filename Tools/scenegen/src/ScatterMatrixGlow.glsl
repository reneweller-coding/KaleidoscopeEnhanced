//@doc
 * @brief SCATTER MATRIX GLOW: a scatter plot matrix: all pairings of red, green, blue, brightness and saturation as small point clouds in a grid, each made of pixels sampled from the photo; the grid moves between the pairings and the number of variables glides.  Each point shines in its
 * own colour with a soft halo, and the clouds are different for every pair.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the size of the halos
 *   audioAdvance -> the sampled places wander (integrated)
 *
 * Knobs: sizeP (the size of the cells), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 q = gl_FragCoord.xy / resolution;
    float asp = resolution.x / resolution.y;
    float N = 3.2 + 1.8 * (0.5 + 0.5 * sin(0.04 * sceneTime + 0.02 * audioAdvance));
    N += 0.8 * clamp(sizeP, 0.0, 1.0);
    vec2 g = vec2(q.x * N * asp * 0.6, q.y * N);
    vec2 ci = floor(g);
    vec2 f = fract(g);
    float vi = mod(ci.x, 5.0);
    float vj = mod(ci.y, 5.0);
    vec3 col = vec3(0.04);
    float hs = 0.03 + 0.04 * clamp(audioSwell, 0.0, 1.0);
    vec3 acc = vec3(0.0);
    for (int k = 0; k < 24; ++k) {
        float fk = float(k);
        vec2 h = hash22(vec2(fk, 2.9));
        vec2 pp = 0.5 + 0.4 * sin(h * 6.2831853 + 0.05 * audioAdvance * (0.5 + h.yx) + 0.03 * sceneTime);
        vec3 c = imgLod(pp, 2.0);
        float mx = max(c.r, max(c.g, c.b));
        float mn = min(c.r, min(c.g, c.b));
        float at[5];
        at[0] = c.r; at[1] = c.g; at[2] = c.b; at[3] = luma(c); at[4] = (mx - mn) / max(mx, 1e-3);
        float ai = 0.0;
        float aj = 0.0;
        for (int a = 0; a < 5; ++a) {
            if (float(a) == vi) ai = at[a];
            if (float(a) == vj) aj = at[a];
        }
        vec2 pt = vec2(0.1 + 0.8 * ai, 0.1 + 0.8 * aj);
        float d = length((f - pt) * vec2(1.0, 1.0));
        acc += c * exp(-d * d / (hs * hs * 0.5)) * 1.8;
    }
    float diag = vi == vj ? 1.0 : 0.0;
    vec3 base = vec3(0.04) + diag * 0.08 * hsv2rgb(vec3(vi / 5.0, 0.5, 1.0));
    float gridl = smoothstep(0.0, 0.03, f.x) * smoothstep(0.0, 0.03, f.y);
    finish((base + acc) * (0.5 + 0.5 * gridl) * 1.2);
}
