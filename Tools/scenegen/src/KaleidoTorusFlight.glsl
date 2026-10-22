//@doc
 * @brief KALEIDO TORUS FLIGHT: a flight through the inside of a torus whose wall is covered with a photo folded
 * doubly periodically -- mirrored in both of the torus' angles -- so the pattern runs round the tube and round the
 * ring at once, and the tube bends away ahead as the eye travels its circle.  The wall is found by marching to the
 * tube's surface (R_tube - |(|xz| - R, y)|), its two angles give the coordinates, which are folded by mirrors into a
 * cell of the photo.  The photo's own colours, calmed toward one colour family; the far wall fades into a haze.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance     -> the travel round the ring (integrated)
 *   audioHarmAdvance -> the pattern's turn round the tube glides with the chord changes
 *   audioSwell       -> the cells' seams glow
 *
 * Knobs: cellP (how many cells round the tube), twistP (how the pattern winds), hueP.
//@params cellP twistP
//@audio audioHarmAdvance audioSwell
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
    const float R = 4.0, RT = 1.0;                               // the ring's radius, the tube's radius
    float h = max(audioHarmAdvance, 0.0);
    float cells = 2.0 * floor(3.0 + 3.0 * clamp(cellP, 0.0, 1.0));   // even: the mirrored cells close round the tube
    float roll = 0.35 * sin(0.6 * h) + 0.15 * sin(0.27 * h + 1.0);
    float wind = 0.5 * clamp(twistP, 0.0, 1.0);
    float travel = 0.05 * sceneTime + 0.2 * audioAdvance;       // the angle round the ring
    // the eye on the tube's core circle, looking along it
    vec3 ro = vec3(R * cos(travel), 0.0, R * sin(travel));
    vec3 fw = normalize(vec3(-sin(travel + 0.25), 0.0, cos(travel + 0.25)));
    vec3 up = vec3(0.0, 1.0, 0.0);
    vec3 rt = normalize(cross(fw, up));
    vec2 pr = rot2(0.05 * sceneTime) * p;
    vec3 rd = normalize(fw * 0.9 + rt * pr.x + up * pr.y);
    float t = 0.0;
    vec3 x = ro;
    for (int i = 0; i < 64; ++i) {
        x = ro + rd * t;
        vec2 w = vec2(length(x.xz) - R, x.y);
        float d = RT - length(w);
        if (d < 0.002) break;
        t += d * 0.8;
    }
    // the wall's two angles: round the ring (u) and round the tube (v)
    float u = atan(x.z, x.x) / 6.2831853 * 24.0;
    vec2 w = vec2(length(x.xz) - R, x.y);
    // the pattern winds round the tube as it goes round the ring (a wave, so it closes up after a full circle)
    float v = atan(w.y, w.x) / 6.2831853 * cells + roll + wind * 3.0 * sin(6.2831853 * u / 24.0 * 2.0);
    // mirror fold into one cell: both coordinates folded, so the pattern closes round both circles
    vec2 cell = vec2(u, v);
    vec2 f = abs(fract(cell * 0.5) * 2.0 - 1.0);
    vec3 photo = imgLod(f * 0.8 + 0.1, 0.8);
    vec3 col = tone(photo, fh);
    float seam = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
    col += famLight(fh, 0.6, 0.5) * exp(-seam / 0.02) * (0.1 + 0.3 * clamp(audioSwell, 0.0, 1.0));
    col *= exp(-0.12 * t);
    col += famCol(fh, 0.45) * 0.04 * (1.0 - exp(-0.12 * t));
    finish(col);
}
