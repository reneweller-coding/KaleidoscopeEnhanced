//@doc
 * @brief DIFFERENTIAL GROWTH FOLDS: lines grow out from a few places and fold and folds again into the convolutions
 * of a brain or a coral, its edges glowing; it grows faster as the music swells, and its folds turn finer or broader as
 * the sound grows rough or smooth.  The growth is a Gray-Scott reaction and diffusion in a field of the scene's own, in
 * the coral regime where a seed line spreads as a folding labyrinth; the field steps faster with the swell, and its kill
 * rate glides with the smoothed roughness, which sets the folds' width.  Once the labyrinth has filled the picture,
 * a slow erosion from the edges lets it grow on.  The edges are where the second substance changes, drawn as glowing
 * lines in shades of one colour family from the photo, the folds filled darker.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell     -> the growth's speed
 *   audioRoughness -> the folds' width (smoothed)
 *
 * Knobs: speedP (how fast it grows), lineP (the edges' width), hueP.
//@params speedP lineP
//@audio audioSwell audioRoughness
//@state 320 180 240 32
//@body
/**  The state pass: one Gray-Scott step (u, v), the roughness smoothed in w.
 *
 * @return
 *   x u, y v, z 0, w the smoothed roughness.
 **/
vec4 stateStep()
{
    ivec2 c = stCell();
    vec2 cc = vec2(c) + 0.5;
    vec2 mid = stateRes * 0.5;
    if (stateFrame < 0.5) {
        float seed = 0.0;                                             // a few short lines to grow from
        for (int i = 0; i < 6; ++i) {
            vec2 h = hash22(vec2(float(i), 3.0));
            vec2 o = stateRes * (0.2 + 0.6 * h);
            vec2 dd = rot2(6.2831853 * h.x) * (cc - o);
            seed = max(seed, (1.0 - smoothstep(0.0, 2.5, abs(dd.y))) * step(abs(dd.x), 14.0));
        }
        return vec4(1.0, seed * 0.5, 0.0, clamp(audioRoughness, 0.0, 1.0));
    }
    vec4 s = stAt(c);
    vec4 lap = stLap(c);
    float rough = mix(s.w, clamp(audioRoughness, 0.0, 1.0), 0.005);
    float F = 0.0545, k = 0.0615 + 0.0012 * rough;
    float uvv = s.x * s.y * s.y;
    float dt = 0.6 + 0.3 * clamp(audioSwell, 0.0, 1.0) + 0.2 * clamp(speedP, 0.0, 1.0);   // stable: D dt < 0.25
    float u = s.x + dt * (0.21 * lap.x - uvv + F * (1.0 - s.x));
    float v = s.y + dt * (0.105 * lap.y + uvv - (F + k) * s.y);
    // a slow erosion near the field's border, so the labyrinth keeps room to grow
    float edge = min(min(cc.x, stateRes.x - cc.x), min(cc.y, stateRes.y - cc.y));
    v *= 1.0 - 0.02 * (1.0 - smoothstep(0.0, 12.0, edge));
    return vec4(clamp(u, 0.0, 1.0), clamp(v, 0.0, 1.0), 0.0, rough);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float fh = famHue();
    vec2 cc = stView(p, 1.0);
    float v = stLin(cc).y;
    float vx = stLin(cc + vec2(1.0, 0.0)).y - stLin(cc - vec2(1.0, 0.0)).y;
    float vy = stLin(cc + vec2(0.0, 1.0)).y - stLin(cc - vec2(0.0, 1.0)).y;
    float gl = length(vec2(vx, vy));
    float lw = 0.6 + 0.8 * clamp(lineP, 0.0, 1.0);
    float edge = smoothstep(0.02, 0.12 / lw, gl);
    vec3 fold = famCol(fh, 0.35) * 0.08 + famCol(fh, 0.6) * 0.12 * smoothstep(0.15, 0.35, v);
    vec3 col = fold + famLight(fh, 0.6, 0.5) * edge * 0.9;
    finish(col);
}
