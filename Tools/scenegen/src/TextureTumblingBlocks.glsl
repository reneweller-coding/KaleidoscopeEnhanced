//@doc
 * @brief TEXTURE TUMBLING BLOCKS: the classic tumbling-blocks illusion --
 * a lattice of rhombi that reads as stacked cubes, each face a piece of
 * the photograph; as the light slowly circles, the faces' shading shifts,
 * and the cubes flip in the mind between standing up and hanging down,
 * rolling in waves across the pattern; bevelled edges catch the light.
 * Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the light circles, the photo drifts (integrated)
 *   audioSpread     -> the shading contrast (how strongly the cubes pop)
 *   audioKick       -> the edges gleam (light)
 *   audioMode       -> light: cool in minor, warm in major
 *   audioPhase      -> the lattice turns (integrated)
 *   audioSwell      -> the photo's colour saturation (slow)
 *
 * Knobs: blockP (block size), waveP (flip waves), edgeP (edge bevel), hueP.
//@params blockP waveP edgeP
//@audio audioSpread audioKick audioMode audioPhase audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float bs = 0.12 + 0.12 * clamp(blockP, 0.0, 1.0);
    vec2 q = rot2(0.01 * sceneTime + 0.1 * audioPhase) * p / bs;
    // Hex cells (pointy-top), each split into three rhombi.
    const vec2 s = vec2(1.7320508, 1.0);
    vec2 ha = mod(q, s) - s * 0.5;
    vec2 hb = mod(q - s * 0.5, s) - s * 0.5;
    vec2 h = dot(ha, ha) < dot(hb, hb) ? ha : hb;
    vec2 cid = q - h;
    cid = floor(cid / (s * 0.5) + 0.5) * (s * 0.5);                // exact centre: hashes must not see rounding noise
    float ang = atan(h.y, h.x);
    // Flat-top hex: split into three rhombi by spokes to the vertices at
    // 0, 120 and 240 degrees.
    float am = mod(ang + 6.2831853, 6.2831853);
    float sec = floor(am / 2.0943951);                          // 0,1,2 (space)
    float mid = sec * 2.0943951 + 1.0471976;                    // the rhombus' middle direction
    vec2 local = rot2(-mid) * h * 2.0;
    // Light circling: each face's brightness from its normal (tilted toward its middle).
    float T = 0.1 * sceneTime + 0.6 * audioAdvance;
    float wave = sin(dot(cid, vec2(0.4, 0.25)) * clamp(waveP + 0.2, 0.0, 1.2) * 2.0 - T * 1.5);
    vec3 L = normalize(vec3(cos(T + 0.8 * wave), sin(T + 0.8 * wave), 0.9));
    vec3 nn = normalize(vec3(cos(mid), sin(mid), 0.8));
    float con = 0.5 + 0.8 * clamp(audioSpread, 0.0, 1.0);
    float lit = 0.6 + con * 0.5 * dot(nn, L);
    vec2 uv = cid * 0.04 + local * 0.18 + vec2(sec * 0.31, sec * 0.17) + 0.5 + vec2(0.003, 0.002) * sceneTime;
    vec3 ph = imgLod(uv, 0.8);
    ph = max(mix(vec3(luma(ph)), ph, 0.6 + 0.8 * swell), 0.0);
    vec3 lc = mix(vec3(0.85, 0.92, 1.1), vec3(1.1, 0.95, 0.8), mode);
    vec3 col = ph * lc * clamp(lit, 0.2, 1.4) * 1.2;
    // Bevelled edges: distance to the rhombus border and to the hex border.
    float edgeSec = abs(mod(am, 2.0943951) - 1.0471976);      // angular distance from the rhombus middle
    float spoke = (1.0471976 - edgeSec) * length(h);
    float hexD = max(abs(h.y), abs(h.y) * 0.5 + abs(h.x) * 0.866);
    float ed = min(spoke, 0.5 - hexD);
    float px = fwidth(q.x) * 1.2;
    float bev = 0.02 + 0.05 * clamp(edgeP, 0.0, 1.0);
    vec3 gc = glowColour(imgLod(uv, 5.0), cid * 0.1, hueP * 0.159);
    col += mix(gc, vec3(1.0), 0.5) * smoothstep(bev + px, 0.0, ed) * (0.15 + 0.7 * kick) * lit;
    col *= 0.75 + 0.25 * smoothstep(0.0, bev * 2.0, ed);
    finish(col);
}
