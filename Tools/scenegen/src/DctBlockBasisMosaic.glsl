//@doc
 * @brief DCT BLOCK BASIS MOSAIC: the photo in blocks of the discrete cosine transform: every block shows only its most important basis pictures, and their number glides steadily from one (a flat tile) up to the full set; the picture builds itself from checkerboard
 * waves and dissolves into them again.  Every block takes sixteen samples, transforms them and rebuilds the block from the first few coefficients along the zig-zag.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the number of coefficients (build up to the photo, break down to blocks)
 *   audioAdvance -> the block grid slides over the photo (integrated)
 *
 * Knobs: sizeP (the block size), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
vec4 dctBasis(float x)
{
    return vec4(1.0, cos(3.1415927 * x), cos(6.2831853 * x), cos(9.4247780 * x));
}
void main()
{
    vec2 fc = gl_FragCoord.xy;
    float px = resolution.y / 270.0;
    float Bb = 12.0 + 12.0 * clamp(sizeP, 0.0, 1.0);
    float B = Bb * px;
    vec2 o = B * vec2(sin(0.01 * audioAdvance + 0.015 * sceneTime), cos(0.012 * audioAdvance)) * 3.0;
    vec2 g = (fc + o) / B;
    vec2 cell = floor(g);
    vec2 f = fract(g);
    vec3 s[16];
    for (int j = 0; j < 4; ++j)
        for (int i = 0; i < 4; ++i) {
            vec2 pc = (cell + (vec2(float(i), float(j)) + 0.5) / 4.0) * B - o;
            s[j * 4 + i] = imgLod((pc - 0.5 * resolution) / resolution.y * 0.8 + 0.5, log2(Bb / 4.0) + 0.4);
        }
    vec3 C[16];
    for (int k = 0; k < 16; ++k) C[k] = vec3(0.0);
    for (int j = 0; j < 4; ++j) {
        vec4 bj = dctBasis((float(j) + 0.5) / 4.0);
        vec3 T[4];
        for (int u = 0; u < 4; ++u) T[u] = vec3(0.0);
        for (int i = 0; i < 4; ++i) {
            vec4 bi = dctBasis((float(i) + 0.5) / 4.0);
            for (int u = 0; u < 4; ++u) T[u] += s[j * 4 + i] * bi[u];
        }
        for (int v = 0; v < 4; ++v)
            for (int u = 0; u < 4; ++u) C[v * 4 + u] += T[u] * bj[v];
    }
    float n = 0.2 + 6.4 * (0.5 + 0.5 * sin(0.05 * sceneTime + 0.03 * audioAdvance + 2.0 * clamp(audioSwell, 0.0, 1.0)));
    vec4 bx = dctBasis(f.x);
    vec4 by = dctBasis(f.y);
    vec3 col = vec3(0.0);
    for (int v = 0; v < 4; ++v)
        for (int u = 0; u < 4; ++u) {
            float w = clamp(n - float(u + v), 0.0, 1.0);
            float a2 = (u == 0 ? 0.25 : 0.5) * (v == 0 ? 0.25 : 0.5) * 4.0;
            col += w * a2 * C[v * 4 + u] * bx[u] * by[v] * 0.25;
        }
    float edge = smoothstep(0.0, 0.05, f.x) * smoothstep(0.0, 0.05, f.y);
    finish(max(col, vec3(0.0)) * (0.85 + 0.15 * edge) * 1.1);
}
