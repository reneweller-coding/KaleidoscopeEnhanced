//@doc
 * @brief DYED ICE MELT: ice-dyeing seen from above -- a heap of ice crystals
 * sprinkled with powdered dyes melts slowly, and the coloured meltwater
 * seeps outward in crystalline, feathery blooms, the dyes splitting into
 * their component colours along the fronts (a purple breaking into blue
 * and magenta), pooling in intense spots, soaking into a white fabric
 * whose weave shows through.  The dye colours come from the photograph.
 * Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the melt spreads (integrated, jump-free)
 *   audioSpread     -> bloom size
 *   audioKick       -> the wet fronts gleam (light)
 *   audioMode       -> dyes: cool in minor, warm in major (tint)
 *   audioRoughness  -> the fronts get more feathery
 *   audioSwell      -> colour intensity (slow)
 *
 * Knobs: bloomP (bloom count), splitP (colour splitting), fabricP (fabric weave), hueP.
//@params bloomP splitP fabricP
//@audio audioSpread audioKick audioMode audioRoughness audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    float weave = 0.5 + 0.5 * sin(p.x * 600.0) * sin(p.y * 600.0);
    vec3 fabric = vec3(0.96, 0.95, 0.93) * (1.0 - 0.06 * clamp(fabricP + 0.3, 0.0, 1.3) * weave);
    vec3 col = fabric;
    float T = 0.03 * sceneTime + 0.2 * audioAdvance;
    float S = 1.3 + 1.2 * clamp(bloomP, 0.0, 1.0);
    vec2 g = p * S;
    vec2 gi = floor(g);
    for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
        vec2 id = gi + vec2(i, j);
        float h = hash21(id);
        float cyc = T * (0.6 + 0.4 * h) + h * 3.0;
        float life = fract(cyc);
        float gen = floor(cyc);
        vec2 c = id + 0.5 + 0.35 * (hash22(id + gen * 1.3) - 0.5);
        vec2 d = g - c;
        float ang = atan(d.y, d.x);
        vec2 u = vec2(cos(ang), sin(ang));
        float R = (0.4 + 0.3 * clamp(audioSpread, 0.0, 1.0)) * sqrt(smoothstep(0.0, 0.6, life));
        // Feathery crystalline front: noise on the unit circle plus fine spikes.
        float feather = (0.15 + 0.25 * rough) * (fbm3(u * 3.0 + h * 9.0 + gen) - 0.5) + (0.05 + 0.1 * rough) * (noise2(u * 18.0 + h * 5.0) - 0.5);
        float rr = length(d) / max(R, 1e-3) + feather;
        float alpha = smoothstep(0.0, 0.08, life) * smoothstep(1.0, 0.75, life);
        // The dye splits: the outer front one component, the inner another.
        vec3 pc = imgPalette(fract(h * 1.7 + gen * 0.11 + hueP * 0.159));
        pc = pc / max(max(pc.r, max(pc.g, pc.b)), 0.2);
        pc = mix(pc, glowColour(pc, id + gen, hueP * 0.159 + h), 0.6);
        pc = max(mix(vec3(luma(pc)), pc, 1.5), 0.0);
        pc *= mix(vec3(0.9, 0.95, 1.1), vec3(1.1, 0.95, 0.85), mode);
        float spl = clamp(splitP, 0.0, 1.0);
        vec3 outer = mix(pc, pc.gbr, spl * 0.6);
        vec3 inner = mix(pc, pc.brg, spl * 0.6);
        vec3 dye = mix(inner, outer, smoothstep(0.3, 0.9, rr));
        float dens = smoothstep(1.0, 0.8, rr) * (0.8 + 0.3 * swell) * (0.8 + 0.4 * smoothstep(0.7, 1.0, rr));   // pigment gathers at the front
        dens += smoothstep(0.25, 0.0, rr) * 0.3;                // an intense pool at the centre
        col *= mix(vec3(1.0), dye, clamp(dens * alpha, 0.0, 1.0));
        // Wet gleam along a fresh front.
        col += vec3(1.0) * exp(-abs(rr - 1.0) * 20.0) * (1.0 - smoothstep(0.0, 0.5, life)) * 0.1 * (1.0 + 2.0 * kick) * alpha;
    }
    finish(col);
}
