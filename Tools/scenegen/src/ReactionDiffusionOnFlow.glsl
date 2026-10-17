//@doc
 * @brief REACTION-DIFFUSION ON FLOW: a Gray-Scott reaction carried by a stirring flow -- a lattice of counter-rotating
 * vortex cells that shifts back and forth, so the spots and worms of the reaction are pulled out into spiral
 * filaments, split, wound up and reborn.  Unlike the resting reaction-diffusion scenes, this one never stands still.
 * The reaction engraves the photo.  An endless, periodic field.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the flow's shift (integrated): the music stirs
 *   audioRoughness  -> the Gray-Scott type: smooth music grows spots, rough music worms and coral (the field
 *                      changes its kind)
 *   audioSwell      -> the flow's strength
 *   audioPhase      -> the palette turns through the photo (integrated)
 *   audioKick       -> the filaments flash (light)
 *
 * Knobs: cellsP (vortex cells across the field), stirP (the base stirring), inkP (engraving depth), hueP.
//@params cellsP stirP inkP
//@audio audioSwell audioKick audioRoughness
//@state 360 200 1200
//@body
/**  The stirring flow at a cell: a lattice of counter-rotating vortices, shifted back and forth with the music.
 *
 * @param x  The cell coordinate. (in)
 *
 * @return
 *   The velocity in cells per step.
 **/
vec2 flowAt(vec2 x)
{
    float n = 2.0 + 2.0 * floor(clamp(cellsP, 0.0, 0.999) * 3.0);   // an even number of cells: periodic
    float nx = 2.0 * floor(0.5 * n * stateRes.x / stateRes.y + 0.5);   // even across the width too
    vec2 q = x / stateRes * 3.14159265 * vec2(nx, n);
    q.x += 1.2 * sin(0.15 * audioAdvance + 0.05 * sceneTime);
    float amp = (0.02 + 0.05 * clamp(stirP, 0.0, 1.0)) * (0.5 + 0.8 * clamp(audioSwell, 0.0, 1.0));
    return amp * vec2(sin(q.x) * cos(q.y), -cos(q.x) * sin(q.y));
}

/**  One semi-Lagrangian advection and Gray-Scott step for this cell (the state pass).
 *
 * @return
 *   u, v, 0, 1.
 **/
vec4 stateStep()
{
    ivec2 ip = stCell();
    if (stateFrame < 0.5) {
        bool seed = hash21(floor(vec2(ip) / 8.0) + 1.3) < 0.15;
        return vec4(seed ? 0.5 : 1.0, seed ? 0.25 : 0.0, 0.0, 1.0);
    }
    vec2 x = vec2(ip) + 0.5;
    vec2 c = stLin(x - flowAt(x)).rg;                           // carried by the flow (traced back one step)
    vec2 lap = stLap(ip).rg;
    float t = clamp(audioRoughness, 0.0, 1.0);
    float F = mix(0.035, 0.058, t), K = mix(0.065, 0.062, t);
    vec2 D = vec2(0.2, 0.1);
    float dt = 0.6;
    float uvv = c.x * c.y * c.y;
    float u2 = c.x + dt * (D.x * lap.x - uvv + F * (1.0 - c.x));
    float v2 = c.y + dt * (D.y * lap.y + uvv - (F + K) * c.y);
    if (stRand(0) < 2.0e-6) v2 = 0.3;                           // a rare spore: the reaction never dies out
    return vec4(clamp(u2, 0.0, 1.0), clamp(v2, 0.0, 1.0), 0.0, 1.0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    vec2 cc = stView(p, 0.6);
    float v = stLin(cc).g;
    vec2 g = vec2(stLin(cc + vec2(1.0, 0.0)).g - stLin(cc - vec2(1.0, 0.0)).g,
                  stLin(cc + vec2(0.0, 1.0)).g - stLin(cc - vec2(0.0, 1.0)).g);
    vec2 uv = cc / stateRes.y * 0.62 + 0.003 * sceneTime * vec2(1.0, 0.5);
    vec3 photo = imgLod(uv, 0.4);
    float cut = smoothstep(0.08, 0.3, v);
    float ink = 0.5 + 0.45 * clamp(inkP, 0.0, 1.0);
    vec3 tone = imgPalette(0.2 + 0.4 * v + 0.03 * audioPhase);
    vec3 col = photo * mix(1.0 - ink, 1.2, cut) + tone * cut * 0.15;
    float lip = max(dot(normalize(vec3(-g * 6.0, 1.0)), normalize(vec3(-0.4, 0.5, 0.8))), 0.0);
    col += mix(tone, vec3(1.0), 0.5) * cut * pow(lip, 6.0) * (0.25 + 0.5 * clamp(audioKick, 0.0, 1.0));
    finish(col);
}
