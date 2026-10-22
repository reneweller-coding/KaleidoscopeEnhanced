//@doc
 * @brief LIFTING SCALES TUNNEL: the tunnel's wall is covered in overlapping scales, and waves run along it in time with
 * the beat, lifting the scales so the light beneath them shines out at their rims.  The scales sit in staggered rows,
 * each a disc that covers the row before it; a scale's lift is a wave travelling along the tunnel, one crest every few
 * beats, counted in a small field of the scene's own -- a lifted scale darkens as it tilts away and a bright crescent of
 * the light underneath opens along its rim.  The scales are the photo, calmed toward one colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBeatPhase -> the waves lifting the scales (beats counted, the waves running on in step)
 *   audioAdvance   -> the flight (integrated)
 *   audioSwell     -> the light beneath the scales
 *
 * Knobs: countP (scales around), liftP (how high they lift), hueP.
//@params countP liftP
//@audio audioBeatPhase audioSwell
//@state 1 1 60 32
//@body
/**  The state pass: the beats counted by summing the beat phase's steps.
 *
 * @return
 *   x the beats so far, y the last beat phase, 0, 1.
 **/
vec4 stateStep()
{
    float bp = clamp(audioBeatPhase, 0.0, 1.0);
    if (stateFrame < 0.5) return vec4(0.0, bp, 0.0, 1.0);
    vec4 old = texelFetch(texState, ivec2(0, 0), 0);
    float d = fract(bp - old.y + 1.0);
    if (d > 0.5) d = 0.0;
    return vec4(mod(old.x + d, 4096.0), bp, 0.0, 1.0);
}

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
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float fh = famHue();
    const float R0 = 0.4;
    float r = max(length(p), 1e-3), a = atan(p.y, p.x);
    float z = R0 / r;
    float fly = 0.25 * sceneTime + 0.9 * audioAdvance;
    vec4 st = texelFetch(texState, ivec2(0, 0), 0);
    float dl = fract(clamp(audioBeatPhase, 0.0, 1.0) - st.y + 1.0);
    float beats = st.x + (dl < 0.5 ? dl : 0.0);                       // the count carried on to this frame
    float M = floor(14.0 + 10.0 * clamp(countP, 0.0, 1.0));          // scales around
    float w = 6.2831853 * R0 / M;                                     // a scale's width
    float x = (a + 0.01 * sceneTime) * R0 / w, y = (z + fly) / (0.55 * w);
    float px = R0 / (r * r * resolution.y) / (0.55 * w);              // a pixel in rows
    float detail = 1.0 - smoothstep(0.15, 0.4, px);
    // the topmost scale over this place: rows nearer the eye cover the ones before
    float best = -1.0, bi = 0.0, bj = 0.0;
    vec2 bl = vec2(0.0);
    float j0 = floor(y);
    for (int dj = 2; dj >= -1; --dj) {
        float j = j0 + float(dj);
        float off = 0.5 * mod(j, 2.0);
        float i = floor(x - off + 0.5);
        for (int di = -1; di <= 1; ++di) {
            float ii = i + float(di);
            vec2 l = vec2(x - off - ii, (y - j) * 0.55);         // in scale widths
            if (best < 0.0 && length(l * vec2(1.0, 0.9)) < 0.62) { best = j; bi = ii; bj = j; bl = l; }
        }
    }
    float lift = (0.4 + 0.6 * clamp(liftP, 0.0, 1.0)) * smoothstep(0.55, 1.0, 0.5 + 0.5 * sin(6.2831853 * (bj * 0.12 - beats / 4.0) + 0.4 * sin(6.2831853 * bi / M * 2.0)));
    float rr = length(bl * vec2(1.0, 0.9)) / 0.62;                     // 0 at the scale's root, 1 at its rim
    vec3 scale = tone(imgLod(vec2(mod(bi, M) / M, fract(bj * 0.071)) * 0.8 + 0.1, 2.5), fh);
    float tilt = 1.0 - 0.45 * lift * rr;
    float rim = exp(-pow((1.0 - rr) / (0.08 + 0.25 * lift), 2.0)) * smoothstep(0.0, 0.3, -bl.y + 0.2);
    vec3 under = famLight(fh, 0.7, 0.5) * (0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0));
    vec3 col = best < 0.0 ? under * 0.2 : scale * (0.35 + 0.55 * (1.0 - rr * rr)) * tilt + under * rim * lift * 1.2;
    col += famLight(fh, 0.5, 0.6) * exp(-pow((1.0 - rr) / 0.04, 2.0)) * 0.12 * detail;
    col = mix(mix(scale * 0.5 + under * 0.15, col, detail), famCol(fh, 0.5) * 0.3, smoothstep(5.0, 18.0, z));
    col += under * exp(-r * 9.0) * 0.4;
    finish(col);
}
