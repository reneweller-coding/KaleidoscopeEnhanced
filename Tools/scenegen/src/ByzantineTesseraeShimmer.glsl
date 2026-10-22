//@doc
 * @brief BYZANTINE TESSERAE SHIMMER: a wall of Byzantine mosaic -- small glass and gold tesserae set in curving rows,
 * each stone tipped a little differently -- and a light wandering over it, so the wall shimmers: stones flash as the
 * light finds their tilt, and waves of tilt run through the rows with the music.  The rows follow arcs round a point
 * below the picture (the andamento); each tessera is a small square with a grout gap, its own tilt and its colour from
 * the photo at its place -- or, for a share of them, gold; the flash is the light mirrored by the tilted face into the
 * eye.  The colours are the photo's, calmed into one family, with gold.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the light wanders (integrated), and tilt waves run through the rows with the music's drive
 *   audioSwell   -> the tilt waves' height
 *
 * Knobs: tileP (the tesserae's size), goldP (the share of gold), hueP.
//@params tileP goldP
//@audio audioSwell
//@body
/**  The photo's colour calmed toward the colour family.
 *
 * @param photo  The photo's colour. (in)
 * @param fh     The family's hue. (in)
 *
 * @return
 *   The colour.
 **/
vec3 tone(vec3 photo, float fh)
{
    float l = luma(photo);
    return mix(photo * 1.1, famCol(fh, 0.15 + 0.7 * l) * (0.25 + 1.2 * l), 0.45);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float T = 0.022 + 0.014 * clamp(tileP, 0.0, 1.0);
    float goldShare = 0.15 + 0.35 * clamp(goldP, 0.0, 1.0);
    float run = 0.03 * sceneTime + 0.12 * audioAdvance;
    float amp = 0.08 + 0.2 * clamp(audioSwell, 0.0, 1.0);
    // the rows: arcs round a point below the picture
    const vec2 C = vec2(0.0, -1.4);
    vec2 d = p - C;
    float rr = length(d) / T, an = atan(d.x, d.y);
    float row = floor(rr);
    float v = rr - row;
    float u = an * (row + 0.5) + 0.37 * row;
    float ui = floor(u), uf = fract(u);
    vec2 id = vec2(ui, row);
    float h = hash21(id);
    float tile = smoothstep(0.04, 0.1, min(min(uf, 1.0 - uf), min(v, 1.0 - v)));
    // each stone's own tilt, and the waves running through the rows
    float wave = sin(0.35 * row - 3.0 * run + 0.15 * ui);
    vec2 tilt = 0.25 * (hash22(id) - 0.5) + amp * vec2(wave, 0.5 * cos(0.2 * ui + 0.3 * row - 2.0 * run));
    vec3 n = normalize(vec3(tilt, 1.0));
    vec3 Lp = vec3(0.7 * sin(0.8 * run), 0.35 * cos(0.6 * run), 1.0);
    vec3 ld = normalize(Lp - vec3(p, 0.0));
    float spec = pow(max(dot(n, normalize(ld + vec3(0.0, 0.0, 1.0))), 0.0), 30.0);
    float anC = (ui + 0.5 - 0.37 * row) / (row + 0.5);
    vec2 tc = C + (row + 0.5) * T * vec2(sin(anC), cos(anC));
    vec3 photo = tone(imgLod(tc * 0.6 + 0.5, 2.0), fh);
    float isGold = step(h, goldShare);
    vec3 goldC = mix(vec3(1.0, 0.78, 0.38), famCol(fh, 0.6), 0.3);
    vec3 base = mix(photo * 0.85, goldC * 0.55, isGold);
    vec3 flash = mix(famLight(fh, 0.5, 0.8) * 0.8, vec3(1.0, 0.85, 0.55) * 1.6, isGold);
    vec3 col = base * (0.45 + 0.55 * max(dot(n, ld), 0.0)) + flash * spec * 1.5;
    col = mix(famCol(fh, 0.4) * 0.05, col, tile);
    finish(col);
}
