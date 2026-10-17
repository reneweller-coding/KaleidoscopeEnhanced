//@doc
 * @brief QUASIPERIODIC DUAL GRID: de Bruijn's multigrid -- five to thirteen families of parallel lines, each family
 * turned by an equal step, cut the plane into a quasiperiodic mosaic of polygons that never repeats; every region
 * is labelled by its index in each family, and the labels' sum decides its shade.  The families slide along
 * their normals, so the whole mosaic rebuilds itself continuously -- regions shrink to points and new ones open.
 * Each region carries its own cut of the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> each change of harmony adds two families (five, seven ... thirteen, crossfaded)
 *   audioPhase      -> the families slide (integrated)
 *   audioKick       -> the grid lines flash (light)
 *
 * Knobs: densityP (lines per screen), linesP (how strongly the lines show), photoP (photo share), hueP.
//@params densityP linesP photoP
//@audio audioKick audioHarmAdvance
//@body
/**  The multigrid's region at a point: the index sum, a hash of the indices, and the distance to the nearest line.
 *
 * @param x  The point. (in)
 * @param n  The number of families. (in)
 *
 * @return
 *   Index sum (x), index hash (y), distance to the nearest line (z).
 **/
vec3 multigrid(vec2 x, float n)
{
    float sum = 0.0, hsh = 0.0, dmin = 1e9;
    float t = 0.05 * audioPhase + 0.03 * sceneTime;
    for (int i = 0; i < 13; ++i) {
        if (float(i) >= n) break;
        float a = 3.14159265 * float(i) / n;
        float gam = 0.2 + 0.6 * fract(0.37 * float(i) + 0.1 * sin(t + float(i) * 1.3));
        float s = dot(x, vec2(cos(a), sin(a))) + gam;
        float k = floor(s);
        sum += k;
        hsh = fract(hsh * 3.71 + k * 0.137 + float(i) * 0.31);
        dmin = min(dmin, min(fract(s), 1.0 - fract(s)));
    }
    return vec3(sum, hsh, dmin);
}

void main()
{
    vec2 p = screenP();
    float dens = 4.0 + 8.0 * clamp(densityP, 0.0, 1.0);
    vec2 x = p * dens;
    float h = max(audioHarmAdvance, 0.0);
    float nA = 5.0 + 2.0 * mod(floor(h), 5.0), nB = 5.0 + 2.0 * mod(floor(h) + 1.0, 5.0);
    float g = smoothstep(0.2, 0.8, fract(h));
    vec3 a = multigrid(x, nA), b = multigrid(x, nB);
    vec3 col = vec3(0.0);
    for (int j = 0; j < 2; ++j) {
        vec3 m = j == 0 ? a : b;
        float w = j == 0 ? 1.0 - g : g;
        if (w < 0.001) continue;
        float lvl = mod(m.x, 4.0) / 3.0;
        vec2 uv = p * 0.6 + 0.5 + vec2(m.y, fract(m.y * 7.3)) * 0.3;
        vec3 photo = imgLod(uv, 0.5);
        vec3 tone = imgPalette(m.y + 0.03 * audioPhase);
        vec3 c = mix(tone * (0.5 + 0.6 * lvl), photo * (0.6 + 0.6 * lvl), 0.4 + 0.5 * clamp(photoP, 0.0, 1.0));
        float line = 1.0 - smoothstep(0.0, 0.06, m.z);
        c = mix(c, mix(tone, vec3(1.0), 0.5) * (0.4 + 0.8 * clamp(audioKick, 0.0, 1.0)), line * (0.2 + 0.6 * clamp(linesP, 0.0, 1.0)));
        col += w * c;
    }
    finish(col);
}
