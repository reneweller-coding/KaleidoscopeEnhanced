//@doc
 * @brief TEXTURE MIRROR PAVILION: inside a pavilion walled with mirror plates, each plate showing its own piece of
 * the photo; the plates tilt in waves with the rhythm, so the pieces slide and the light glints across the walls.  The
 * pavilion is seen as a deep room: the back wall and the side walls are grids of square plates in steel frames; a
 * plate's tilt is a wave of the counted beats running over the grid, and the tilt shifts the reflected piece of the
 * photo and turns a highlight on or off.  The photo is calmed toward one colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBeatPhase -> the plates tilt in waves, one wave a beat (counted)
 *   audioSwell     -> the glints' strength
 *
 * Knobs: plateP (the plates' size), tiltP (how far they tilt), hueP.
//@params plateP tiltP
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

/**  A wall of mirror plates at a place.
 *
 * @param q      The place on the wall (in wall units). (in)
 * @param S      A plate's size. (in)
 * @param wall   Which wall (for the pieces of the photo). (in)
 * @param beats  The beats so far. (in)
 * @param tilt   How far the plates tilt. (in)
 * @param px     A pixel on the wall. (in)
 * @param fh     The family's hue. (in)
 *
 * @return
 *   The light.
 **/
vec3 plates(vec2 q, float S, float wall, float beats, float tilt, float px, float fh)
{
    vec2 g = q / S;
    vec2 cell = floor(g);
    vec2 l = fract(g) - 0.5;
    float wave = sin(6.2831853 * (beats * 0.5 - 0.12 * (cell.x + cell.y)) + wall);
    vec2 t = tilt * vec2(wave, cos(6.2831853 * (beats * 0.5 - 0.1 * cell.x) + wall));
    vec2 uv = vec2(0.5) + (cell + 0.5) * S * vec2(0.18, 0.3) + vec2(0.31, 0.17) * wall + t * 0.6 + l * S * 0.15;
    vec3 piece = tone(imgLod(uv, 1.5), fh);
    float glint = pow(max(1.0 - length(t - vec2(0.25, 0.15)) * 3.0, 0.0), 4.0);
    float frame = 1.0 - smoothstep(0.44 - px / S, 0.44 + px / S, max(abs(l.x), abs(l.y)));
    vec3 steel = famCol(fh, 0.4) * 0.12;
    return mix(steel, piece * (0.6 + 0.3 * wave * tilt * 3.0) + famLight(fh, 0.6, 0.85) * glint * (0.5 + 0.8 * clamp(audioSwell, 0.0, 1.0)), frame);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float fh = famHue();
    const float F = 1.0, WX = 1.1, WY = 0.7, ZB = 3.0;
    vec4 st = texelFetch(texState, ivec2(0, 0), 0);
    float dl = fract(clamp(audioBeatPhase, 0.0, 1.0) - st.y + 1.0);
    float beats = st.x + (dl < 0.5 ? dl : 0.0);                       // the count carried on to this frame
    float S = 0.22 + 0.14 * clamp(plateP, 0.0, 1.0);
    float tilt = 0.08 + 0.12 * clamp(tiltP, 0.0, 1.0);
    // which surface: the back wall, the side walls, the floor or the ceiling, whichever the ray meets first
    float zx = WX * F / max(abs(p.x), 1e-4), zy = WY * F / max(abs(p.y), 1e-4);
    float z = min(min(zx, zy), ZB);
    vec3 col;
    if (z >= ZB) {
        vec2 q = p * ZB / F;
        col = plates(q + vec2(5.0, 5.0), S, 0.0, beats, tilt, ZB / F / resolution.y, fh);
    } else if (zx < zy) {
        vec2 q = vec2(z, p.y * z / F);
        col = plates(q + vec2(5.0, 5.0), S, sign(p.x) + 2.0, beats, tilt, z * z / (WX * F) / resolution.y, fh);
    } else {
        vec2 q = vec2(p.x * z / F, z);
        col = plates(q + vec2(5.0, 5.0), S, sign(p.y) + 5.0, beats, tilt, z * z / (WY * F) / resolution.y, fh) * 0.8;
    }
    col *= exp(-0.12 * z);
    finish(col);
}
