//@doc
 * @brief KLEIN BLUE SPONGE: Yves Klein's sponge reliefs in motion -- a wall
 * covered with natural sea sponges soaked in pure ultramarine pigment,
 * their porous bodies catching light and swallowing it in that deep,
 * velvety blue; the sponges are round lumpy forms of every size with
 * holes and pores, casting soft shadows; a slow light moves over the
 * relief, and the photograph lends faint undertones to the pigment.
 * Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the light moves (integrated, jump-free)
 *   audioSpread     -> the sponges swell
 *   audioKick       -> the pigment glows (light)
 *   audioMode       -> in major some sponges turn Klein gold or pink (IKB stays the ground)
 *   audioRoughness  -> the pores get coarser
 *   audioSwell      -> the relief shadows deepen (slow)
 *
 * Knobs: spongeP (sponge density), poreP (pore size), undertoneP (photo undertone), hueP.
//@params spongeP poreP undertoneP
//@audio audioSpread audioKick audioMode audioRoughness audioSwell
//@body
float gS, gGrow;
// Height of the sponge relief (0 wall .. 1 top), with pores.
float spongeH(vec2 p, float poreScale)
{
    vec2 g = p * gS;
    vec2 gi = floor(g);
    float h = 0.0;
    for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
        vec2 id = gi + vec2(i, j);
        vec2 c = id + 0.5 + 0.3 * (hash22(id) - 0.5);
        float R = (0.35 + 0.25 * hash21(id + 2.0)) * gGrow;
        vec2 d = g - c;
        float lump = 1.0 + 0.2 * (fbm3(d * 3.0 + id * 5.0) - 0.5);
        float r = length(d) / (R * lump);
        h = max(h, sqrt(max(0.0, 1.0 - r * r)));
    }
    // Pores: round holes, smaller and denser at a finer scale.
    vec2 q = p * poreScale;
    vec2 qi = floor(q);
    float pore = length(fract(q) - 0.25 - 0.5 * hash22(qi)) / (0.18 + 0.2 * hash21(qi + 3.0));
    h -= smoothstep(1.0, 0.3, pore) * 0.35 * step(0.01, h);
    h -= 0.08 * fbm3(p * poreScale * 0.4);
    return max(h, 0.0);
}

void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    gS = 2.5 + 3.0 * clamp(spongeP, 0.0, 1.0);
    gGrow = 0.85 + 0.35 * clamp(audioSpread, 0.0, 1.0);
    float poreScale = (60.0 - 30.0 * clamp(poreP, 0.0, 1.0)) * (1.0 - 0.3 * rough);
    float e = 0.002;
    float h = spongeH(p, poreScale);
    float hx = spongeH(p + vec2(e, 0.0), poreScale), hy = spongeH(p + vec2(0.0, e), poreScale);
    vec3 n = normalize(vec3(-(hx - h) / e * 0.02, -(hy - h) / e * 0.02, 1.0));
    float la = 0.05 * sceneTime + 0.35 * audioAdvance;
    vec3 L = normalize(vec3(cos(la), sin(la), 0.7 - 0.3 * swell));
    float diff = max(dot(n, L), 0.0);
    // Pigment: matte, velvety (rim light), deep where the pores are.
    vec3 ikb = vec3(0.0, 0.18, 0.66);
    vec3 gold = vec3(0.85, 0.62, 0.2);
    vec3 pig = mix(ikb, mix(gold, vec3(0.9, 0.45, 0.55), smoothstep(0.45, 0.6, fbm3(p * 1.5 + 3.0))), smoothstep(0.55, 0.95, mode) * smoothstep(0.4, 0.6, fbm3(p * 1.1 + 7.0)));
    vec2 uv = p * 0.6 + 0.5;
    pig = mix(pig, pig * (0.6 + 0.8 * imgLod(uv, 3.0)), 0.3 * clamp(undertoneP, 0.0, 1.0));
    pig = mix(pig, pig * glowColour(imgLod(uv, 6.0), p, hueP * 0.159) * 1.4, 0.06);
    float velvet = pow(1.0 - n.z, 1.5) * 0.4;
    vec3 col = pig * (0.25 + 0.95 * diff + velvet) * (0.35 + 0.65 * smoothstep(0.0, 0.3, h));
    col *= 1.0 + 0.5 * kick;
    // Shadow cast by neighbouring lumps onto the wall.
    float sh = spongeH(p + L.xy * 0.02, poreScale);
    col *= 1.0 - (0.3 + 0.3 * swell) * smoothstep(0.0, 0.3, sh - h - 0.05);
    finish(col);
}
