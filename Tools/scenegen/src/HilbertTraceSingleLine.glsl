//@doc
 * @brief HILBERT TRACE SINGLE LINE: a single line that traces the photo: it follows the Hilbert curve but draws itself apart at light places and together at dark ones; the resolution of the curve glides from coarse to fine.  Every pixel finds its cell on the curve, takes the line through the cell's centre and its two
 * neighbours on the curve, and draws it with a width that follows the darkness; two levels of the curve are cross-faded.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the resolution of the curve (coarse to fine) glides
 *   audioSpread  -> the line width (smoothed)
 *
 * Knobs: sizeP (the base resolution), hueP.
//@params sizeP
//@audio audioSwell audioSpread
//@body
vec2 d2xy(int n, float d)
{
    vec2 xy = vec2(0.0);
    float t = d;
    float s = 1.0;
    for (int i = 0; i < 7; ++i) {
        if (i >= n) break;
        float rx = mod(floor(t / 2.0), 2.0);
        float ry = mod(t + rx, 2.0);
        if (ry < 0.5) {
            if (rx > 0.5) { xy = vec2(s - 1.0 - xy.x, s - 1.0 - xy.y); }
            xy = xy.yx;
        }
        xy += s * vec2(rx, ry);
        t = floor(t / 4.0);
        s *= 2.0;
    }
    return xy;
}
float xy2d(int n, vec2 xy)
{
    float N = exp2(float(n));
    vec2 p = xy;
    float d = 0.0;
    for (int i = 0; i < 7; ++i) {
        if (i >= n) break;
        float s = N * 0.5 / exp2(float(i));
        float rx = mod(floor(p.x / s), 2.0) > 0.5 ? 1.0 : 0.0;
        float ry = mod(floor(p.y / s), 2.0) > 0.5 ? 1.0 : 0.0;
        float v = rx > 0.5 ? (ry > 0.5 ? 2.0 : 3.0) : (ry > 0.5 ? 1.0 : 0.0);
        d += s * s * v;
        if (ry < 0.5) {
            if (rx > 0.5) p = vec2(N - 1.0 - p.x, N - 1.0 - p.y);
            p = p.yx;
        }
    }
    return d;
}
vec4 hilbertLine(vec2 p, int n, float lw)
{
    float N = exp2(float(n));
    vec2 q = (p / 1.0 + vec2(0.89, 0.5)) / vec2(1.78, 1.0);
    vec2 cell = floor(q * N);
    if (cell.x < 0.0 || cell.y < 0.0 || cell.x >= N || cell.y >= N) return vec4(0.0);
    float d = xy2d(n, cell);
    vec2 c0 = (d2xy(n, d) + 0.5) / N;
    vec2 cm = d > 0.5 ? (d2xy(n, d - 1.0) + 0.5) / N : c0;
    vec2 cp = d < N * N - 1.5 ? (d2xy(n, d + 1.0) + 0.5) / N : c0;
    vec2 qq = q;
    float dist = min(sdSeg(qq, 0.5 * (cm + c0), c0), sdSeg(qq, c0, 0.5 * (cp + c0)));
    float cs = 1.0 / N;
    float dark = 1.0 - luma(imgLod((qq - 0.5) * vec2(1.78, 1.0) * 0.85 + 0.5, 1.0 + log2(cs * 270.0 * 0.5)));
    float w = cs * (0.06 + lw * (0.15 + 0.7 * dark));
    float line = 1.0 - smoothstep(w * 0.7, w * 1.1, dist);
    return vec4(line, dark, 0.0, 1.0);
}
void main()
{
    vec2 p = screenP();
    float lf = 4.0 + 1.6 * (0.5 + 0.5 * sin(0.05 * sceneTime)) + 1.0 * clamp(audioSwell, 0.0, 1.0) + 0.5 * clamp(sizeP, 0.0, 1.0);
    int l0 = int(floor(lf));
    float f = smoothstep(0.0, 1.0, fract(lf));
    float lw = 0.4 + 0.6 * clamp(audioSpread, 0.0, 1.0);
    vec4 a = hilbertLine(p, l0, lw);
    vec4 b = hilbertLine(p, l0 + 1, lw);
    float line = mix(a.x, b.x, f);
    vec3 c = imgLod(p * 0.85 + 0.5, 0.8);
    c = mix(vec3(luma(c)), c, 1.4);
    vec3 paper = vec3(0.95, 0.93, 0.88);
    vec3 ink = mix(vec3(0.05), c * 0.6, 0.4);
    finish(mix(paper, ink, line));
}
