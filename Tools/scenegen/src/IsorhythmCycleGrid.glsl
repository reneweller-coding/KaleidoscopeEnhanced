//@doc
 * @brief ISORHYTHM CYCLE GRID: isorhythm: two cycles of unequal length -- seven tones and five beats -- run against each other and their phase shift is a grid in which every cell is another piece of the photo: the 35
 * cells are met one after the other, a bright cell as each comes up and a glow fading behind it, and only after thirty-five beats does the pattern close.  The beats are counted in a small field of the scene's own, so the walk never jumps.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBeatPhase  -> the beats counted (35 to a cycle), the share of the current one
 *   audioSwell      -> the cells' light
 *
 * Knobs: gapP (the width of the joints), hueP.
//@params gapP
//@audio audioSwell
//@state 1 1 30 32
//@body
/**  The state pass: the beats counted modulo thirty-five (x) and the last beat phase (y).
 *
 * @return
 *   x the counted beats, y the last beat phase, 0, 1.
 **/
vec4 stateStep()
{
    float bp = rhyBeat();
    if (stateFrame < 0.5) return vec4(0.0, bp, 0.0, 1.0);
    vec4 old = texelFetch(texState, ivec2(0, 0), 0);
    return vec4(mod(old.x + (bp < old.y - 0.5 ? 1.0 : 0.0), 35.0), bp, 0.0, 1.0);
}
void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    vec4 st = texelFetch(texState, ivec2(0, 0), 0);
    float bp = rhyBeat();
    float pos = mod(st.x + (bp < st.y - 0.5 ? 1.0 : 0.0) + bp, 35.0);
    vec2 g = vec2((p.x / asp + 0.5) * 7.0, (0.5 - p.y) * 5.0);
    vec2 cell = floor(clamp(g, vec2(0.0), vec2(6.999, 4.999)));
    vec2 f = fract(g);
    float n = mod(15.0 * cell.x + 21.0 * cell.y, 35.0);
    float dl = mod(pos - n + 17.5, 35.0) - 17.5;
    float glow = exp(-max(dl, 0.0) * 0.2 + min(dl, 0.0) * 3.0);
    vec2 tile = (cell + 0.5) / vec2(7.0, 5.0);
    float z = 1.0 - 0.3 * glow;
    vec2 q = ((tile - 0.5) + (f - 0.5) / vec2(7.0, 5.0) * z) * vec2(asp, 1.0);
    vec3 c = imgLod(q * 0.8 + 0.5, 0.6);
    float gap = 0.02 + 0.05 * clamp(gapP, 0.0, 1.0);
    float joint = smoothstep(0.0, gap, min(f.x, 1.0 - f.x)) * smoothstep(0.0, gap * 1.4, min(f.y, 1.0 - f.y));
    float lit = 0.5 + 0.9 * glow + 0.25 * clamp(audioSwell, 0.0, 1.0);
    finish(c * lit * joint * 1.1);
}
