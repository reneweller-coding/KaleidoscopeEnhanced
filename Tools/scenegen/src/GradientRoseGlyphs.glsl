//@doc
 * @brief GRADIENT ROSE GLYPHS: small rose diagrams spread over the whole picture, each showing the orientation of the edges in its cell: eight petals for eight directions, the length of a petal the strength of the edges that
 * way; the picture is redrawn as a field of glyphs that follows the lines of the photo -- long petals along the edges, short in flat places.  Each glyph wears the photo's colour at its cell.  The orientation histograms are
 * counted in a small field of the scene's own, a few times a second.  The glyphs grow with the swell and their lines thicken with the spectral spread.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the length of the petals
 *   audioSpread     -> the thickness of the petals
 *
 * Knobs: sizeP (the size of the glyphs), hueP.
//@params sizeP
//@audio audioSwell audioSpread
//@state 256 18 6 32
//@body
/**  The state pass: for every cell of the photo (32 by 18) the strength of its edges in each of eight orientations.
 *
 * @return
 *   x the strength in this orientation, 0, 0, 1.
 **/
vec4 stateStep()
{
    ivec2 c = stCell();
    int cx = c.x / 8, bin = c.x - 8 * (c.x / 8);
    float acc = 0.0;
    float e = 0.004;
    for (int i = 0; i < 6; ++i) {
        for (int j = 0; j < 6; ++j) {
            vec2 uv = (vec2(float(cx), float(c.y)) + (vec2(float(i), float(j)) + 0.5) / 6.0) / vec2(32.0, 18.0);
            float gx = luma(imgLod(uv + vec2(e, 0.0), 1.5)) - luma(imgLod(uv - vec2(e, 0.0), 1.5));
            float gy = luma(imgLod(uv + vec2(0.0, e), 1.5)) - luma(imgLod(uv - vec2(0.0, e), 1.5));
            float a = mod(atan(gy, gx) + 3.1415927, 3.1415927);
            int bb = int(floor(a / 3.1415927 * 8.0)) % 8;
            acc += bb == bin ? length(vec2(gx, gy)) : 0.0;
        }
    }
    float now = acc / 36.0 / (2.0 * e) * 0.15;
    float old = stateFrame < 0.5 ? now : texelFetch(texState, c, 0).x;
    return vec4(mix(old, now, 0.35), 0.0, 0.0, 1.0);
}
/**  The distance of a point to a segment.
 *
 * @param p  The point. (in)
 * @param a  One end of the segment. (in)
 * @param b  The other end. (in)
 *
 * @return
 *   The distance.
 **/
float segDist(vec2 p, vec2 a, vec2 b)
{
    vec2 pa = p - a, ba = b - a;
    return length(pa - ba * clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0));
}
void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    vec2 g = vec2((p.x / asp + 0.5) * 32.0, (0.5 - p.y) * 18.0);
    ivec2 cell = ivec2(clamp(floor(g), vec2(0.0), vec2(31.0, 17.0)));
    vec2 f = (fract(g) - 0.5);
    float mx = 0.02;
    for (int k = 0; k < 8; ++k) mx = max(mx, texelFetch(texState, ivec2(cell.x * 8 + k, cell.y), 0).x);
    float L = 0.9 * (0.55 + 0.45 * clamp(audioSwell, 0.0, 1.0)) * (0.7 + 0.6 * clamp(sizeP, 0.0, 1.0));
    float w = 0.07 + 0.08 * clamp(audioSpread, 0.0, 1.0);
    float m = 0.0;
    for (int k = 0; k < 8; ++k) {
        float th = (float(k) + 0.5) * 0.3926991 + 1.5707963;
        float s = texelFetch(texState, ivec2(cell.x * 8 + k, cell.y), 0).x / mx;
        vec2 dir = vec2(cos(th), sin(th)) * L * (0.12 + 0.88 * s);
        float d = segDist(f * vec2(1.0), -dir, dir);
        m = max(m, smoothstep(w, w * 0.4, d));
    }
    vec2 cp = (vec2(cell) + 0.5) / vec2(32.0, 18.0);
    vec3 c = imgLod(cp, 3.5);
    c = clamp(mix(vec3(luma(c)), c, 1.5), 0.0, 1.0);
    vec3 bg = imgLod(cp, 5.0) * 0.12;
    finish(mix(bg, c * 1.35, m));
}
