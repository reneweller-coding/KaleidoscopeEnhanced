//@doc
 * @brief BEGONE DULL CARE FILM PAINT: after Norman McLaren: paint put straight onto the film strip -- washes, dabs and
 * scratches -- running down through the picture; unlike the original's frame-by-frame flicker everything here flows:
 * the strip runs continuously, so dabs and scratches slide past instead of jumping.  The washes are bands of warped
 * noise in two or three colours of the photo, the dabs round blots, the scratches thin bright lines scraped through
 * the paint; a faint row of sprocket holes runs at each side.  Colours from the photo, calmed toward one colour
 * family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance   -> the strip runs (integrated: faster with the music's drive)
 *   audioOnset     -> fresh dabs glow up
 *   audioRoughness -> more scratches
 *
 * Knobs: washP (how much the washes swirl), dabP (how many dabs), hueP.
//@params washP dabP
//@audio audioOnset audioRoughness
//@body
/**  A paint colour: one of three tones of the photo, calmed toward the colour family.
 *
 * @param k   Which tone, 0..1. (in)
 * @param fh  The family's hue. (in)
 *
 * @return
 *   The colour.
 **/
vec3 paint(float k, float fh)
{
    vec3 c = imgLod(vec2(0.2 + 0.6 * k, 0.35 + 0.3 * fract(k * 3.7)), 5.5);
    float l = luma(c);
    return mix(c * 1.4, famCol(fh, 0.1 + 0.8 * k) * (0.5 + 0.9 * l), 0.5);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float run = 0.08 * sceneTime + 0.35 * audioAdvance;
    vec2 q = vec2(p.x, p.y + run);
    // the washes: bands of warped noise, each its own tone
    float swirl = 0.3 + 0.7 * clamp(washP, 0.0, 1.0);
    vec2 w = q * vec2(1.6, 2.4);
    w += swirl * vec2(fbm(w + 1.3), fbm(w.yx - 2.1));
    float n1 = fbm(w), n2 = fbm(w * 1.3 + 5.0);
    vec3 col = paint(0.15, fh) * smoothstep(0.45, 0.6, n1) * 0.9;
    col = mix(col, paint(0.55, fh), smoothstep(0.5, 0.62, n2) * 0.8);
    // the dabs: round blots on a lattice, each with a darker rim where the paint pooled
    vec2 g = q * vec2(5.0, 5.0);
    vec2 gid = floor(g);
    float hg = fract(sin(dot(gid, vec2(12.9898, 78.233))) * 43758.5453);
    if (hg < 0.15 + 0.35 * clamp(dabP, 0.0, 1.0)) {
        vec2 c = gid + 0.5 + 0.3 * (vec2(fract(hg * 7.3), fract(hg * 3.1)) - 0.5);
        float r = length((g - c) * vec2(1.0, 1.0 + 0.4 * fract(hg * 5.1))) / (0.2 + 0.2 * fract(hg * 9.3));
        float dab = smoothstep(1.0, 0.85, r);
        vec3 dc = paint(fract(hg * 2.7), fh) * (1.1 + 0.8 * clamp(audioOnset, 0.0, 1.0) * step(0.6, fract(hg * 13.0)));
        col = mix(col, dc, dab);
        col *= 1.0 - 0.4 * exp(-pow((r - 0.95) / 0.06, 2.0));
    }
    // the scratches: thin bright lines scraped through, running with the strip, slightly wavering
    float sc = 0.0;
    for (int i = 0; i < 6; ++i) {
        float fi = float(i);
        float x = -0.85 + 1.7 * fract(0.618 * fi + 0.37) + 0.02 * sin(q.y * (3.0 + fi) + fi);
        float on = step(fi, 1.0 + 5.0 * clamp(audioRoughness, 0.0, 1.0));
        float len = smoothstep(0.0, 0.15, fract(q.y * 0.3 + 0.17 * fi)) * smoothstep(1.0, 0.7, fract(q.y * 0.3 + 0.17 * fi));
        sc += exp(-pow((p.x - x) / 0.0025, 2.0)) * len * on;
    }
    col += famLight(fh, 0.5, 0.9) * sc * 0.8;
    // the sprocket holes at the sides
    vec2 sh = vec2(abs(p.x) - 0.84, fract(q.y * 4.0) - 0.5);
    col += famCol(fh, 0.5) * 0.08 * smoothstep(0.03, 0.02, max(abs(sh.x), abs(sh.y) * 0.35));
    finish(col);
}
