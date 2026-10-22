//@doc
 * @brief ISLIMI SCROLL GROWTH: arabesque scrolls in the Islimi manner grow out of the centre: golden spiral tendrils curl
 * outward in mirrored pairs, crossing into a lattice of scrolls with almond leaves where they meet, the whole ornament
 * symmetric round the middle; it grows and draws back with the melody, and its symmetry follows the key.  The
 * tendrils are the two mirrored families of logarithmic spirals in a mirrored sector (constant ln r / b -/+ angle);
 * the leaves sit where both families pass halfway between their lines; the growth front glows.  Gold lines on a dark
 * ground, toned by the photo's colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioMelody[96] -> the ornament grows outward as the melody rises and draws back as it falls (smoothed)
 *   audioMode       -> the symmetry: six-fold in minor, eight-fold in major (cross-faded)
 *   audioAdvance    -> the tendrils turn slowly (integrated)
 *
 * Knobs: armP (how many tendrils per sector), leafP (the leaves' size), hueP.
//@params armP leafP
//@audio audioMelody[96] audioMelodyHead audioMode
//@body
/**  The melody's recent mean: the sounding samples of the ring, triangle-weighted toward the newest.
 *
 * @return
 *   The pitch, 0..1 (0.5 when nothing sounds).
 **/
float melodyMean()
{
    int hi = int(audioMelodyHead * 96.0);
    float s = 0.0, w = 0.0;
    for (int j = 0; j < 48; ++j) {
        float m = audioMelody[(hi + 96 - j) % 96];
        float wj = (48.0 - float(j)) * step(0.001, m);
        s += wj * m;
        w += wj;
    }
    return w > 0.0 ? s / w : 0.5;
}

/**  The ornament for one symmetry.
 *
 * @param p     The place. (in)
 * @param n     The number of mirrored sectors. (in)
 * @param arms  Tendrils per sector. (in)
 * @param leaf  The leaves' size. (in)
 * @param turn  The tendrils' turning. (in)
 *
 * @return
 *   x the tendrils, y the leaves.
 **/
vec2 ornament(vec2 p, float n, float arms, float leaf, float turn)
{
    float r = max(length(p), 1e-4);
    float sec = 6.2831853 / n;
    float a = abs(mod(atan(p.y, p.x) + turn, sec) - 0.5 * sec);
    const float B = 0.32;
    float lr = log(r) / B;
    vec2 s = vec2(lr - a * arms * n / 6.2831853 * 6.0, lr + a * arms * n / 6.2831853 * 6.0) / 6.0;
    vec2 ds = abs(fract(s + 0.5) - 0.5);
    float w = max(0.04, 4.0 / (resolution.y * r));                // at least a pixel and a half on screen
    float lines = exp(-pow(ds.x / w, 2.0)) + exp(-pow(ds.y / w, 2.0));
    vec2 lf = abs(fract(s) - 0.5);
    float leaves = smoothstep(leaf, leaf * 0.6, length(lf * vec2(1.0, 2.2)));
    return vec2(lines, leaves);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float arms = 1.0 + floor(2.0 * clamp(armP, 0.0, 1.0));
    float leaf = 0.12 + 0.1 * clamp(leafP, 0.0, 1.0);
    float grow = 0.3 + 0.9 * melodyMean();
    float mj = smoothstep(0.35, 0.65, clamp(audioMode, 0.0, 1.0));
    float turn = 0.01 * sceneTime + 0.04 * audioAdvance;
    vec2 o = (1.0 - mj) * ornament(p, 6.0, arms, leaf, turn) + mj * ornament(p, 8.0, arms, leaf, turn);
    float r = length(p);
    float reach = smoothstep(grow + 0.05, grow - 0.05, r);
    float front = exp(-pow((r - grow) / 0.03, 2.0));
    vec3 gold = mix(vec3(1.0, 0.78, 0.38), famCol(fh, 0.6), 0.35);
    vec3 col = famCol(fh, 0.4) * 0.03;
    col += gold * (o.x * 0.8 + o.y * 0.6) * (reach + 0.12) * (1.0 + 1.5 * front);
    finish(col);
}
