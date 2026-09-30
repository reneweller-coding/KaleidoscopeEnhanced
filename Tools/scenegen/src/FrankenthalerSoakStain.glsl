//@doc
 * @brief FRANKENTHALER SOAK STAIN: colour-field painting by soak-staining --
 * thinned washes of colour bleed into raw canvas in great translucent
 * pools, their edges darker where the pigment gathered as the pool dried,
 * the canvas weave showing through, overlapping pools mixing like
 * watercolour; the pools slowly spread, shift and fade into new ones.
 * The colours come from the photograph.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the pools spread and move (integrated, jump-free)
 *   audioSpread     -> pool size
 *   audioMode       -> palette: cool washes in minor, warm in major (tint)
 *   audioKick       -> the colours brighten (light)
 *   audioRoughness  -> the pool edges get more ragged
 *   audioSwell      -> the saturation of the washes (slow)
 *
 * Knobs: poolP (pool count), edgeP (dark drying edges), canvasP (canvas showing), hueP.
//@params poolP edgeP canvasP
//@audio audioSpread audioMode audioKick audioRoughness audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    vec3 canvas = vec3(0.93, 0.9, 0.82);
    float weave = 0.5 + 0.5 * sin(p.x * 900.0) * sin(p.y * 900.0);
    canvas *= 0.95 + 0.05 * weave;
    vec3 col = canvas;
    float T = 0.02 * sceneTime + 0.15 * audioAdvance;
    float nP = 4.0 + 4.0 * clamp(poolP, 0.0, 1.0);
    float size = 0.35 + 0.25 * clamp(audioSpread, 0.0, 1.0);
    for (int i = 0; i < 8; ++i) {
        float fi = float(i);
        float on = smoothstep(fi - 0.5, fi + 0.5, nP - 0.5);
        if (on <= 0.0) break;
        float life = fract(T * 0.4 + fi / 8.0);
        float gen = floor(T * 0.4 + fi / 8.0);
        float h = hash11(fi * 3.1 + gen * 1.7);
        vec2 c = vec2(1.6 * (hash11(h * 13.0) - 0.5), 0.9 * (hash11(h * 17.0) - 0.5)) + 0.1 * vec2(sin(T + fi), cos(T * 0.8 + fi));
        float R = size * (0.6 + 0.6 * hash11(h * 5.0)) * (0.6 + 0.4 * smoothstep(0.0, 0.4, life));
        vec2 d = p - c;
        float ang = atan(d.y, d.x);
        vec2 u = vec2(cos(ang), sin(ang));
        float edgeN = fbm3(u * 2.0 + h * 10.0) + (0.1 + 0.25 * rough) * noise2(u * 9.0 + h * 3.0);
        float rr = length(d * vec2(1.0, 1.3)) / (R * (0.75 + 0.5 * edgeN));
        float inside = smoothstep(1.0, 0.95, rr);
        // Pigment gathers at the drying edge.
        float rim = smoothstep(0.75, 1.0, rr) * inside;
        float alpha = smoothstep(0.0, 0.15, life) * smoothstep(1.0, 0.7, life) * on;
        vec3 pc = imgPalette(fract(h * 1.3 + hueP * 0.159));
        pc = pc / max(max(pc.r, max(pc.g, pc.b)), 0.2);
        pc = mix(pc, glowColour(pc, vec2(h * 9.0, 0.0), hueP * 0.159 + h), 0.5);
        pc = max(mix(vec3(luma(pc)), pc, 1.1 + 0.6 * swell), 0.0);
        pc *= mix(vec3(0.85, 0.95, 1.1), vec3(1.1, 0.95, 0.85), mode);
        // Multiply like a transparent stain (watercolour mixing).
        float density = (0.75 + 0.6 * rim * (0.5 + clamp(edgeP, 0.0, 1.0))) * alpha * inside;
        density *= 0.85 + 0.15 * fbm3(p * 6.0 + h * 4.0);
        col *= mix(vec3(1.0), pc * (0.9 + 0.3 * kick), clamp(density, 0.0, 1.0));
    }
    // The canvas weave shows through the washes.
    col = mix(col, col * (0.9 + 0.2 * weave), 0.3 + 0.5 * clamp(canvasP, 0.0, 1.0));
    finish(col);
}
