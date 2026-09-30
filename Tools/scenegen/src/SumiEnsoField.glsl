//@doc
 * @brief SUMI ENSO FIELD: Zen ink circles drawn again and again -- bold
 * enso brush circles appear across a field of rice paper, each drawn in
 * one sweep as we watch (the stroke growing around, dry-brush streaks
 * where the ink ran out, a heavy start and a flicking tail), then slowly
 * fading while new ones are drawn elsewhere; the paper carries the
 * photograph as a faint wash.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the drawing (integrated, jump-free)
 *   audioSpread     -> the circles' size
 *   audioRoughness  -> dry-brush streaks
 *   audioKick       -> the wet ink gleams (light)
 *   audioMode       -> ink: blue-black in minor, sepia/cinnabar accents in major (blend)
 *   audioSwell      -> the photo wash on the paper (slow)
 *
 * Knobs: densityP (circles), brushP (brush width), gapP (the open gap of the circle), hueP.
//@params densityP brushP gapP
//@audio audioSpread audioRoughness audioKick audioMode audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    vec2 uv = p * 0.6 + 0.5;
    vec3 paper = vec3(0.94, 0.91, 0.84) * (0.96 + 0.04 * fbm3(p * 30.0));
    paper = mix(paper, paper * (0.7 + 0.5 * imgLod(uv, 3.0)), 0.15 + 0.3 * swell);
    vec3 col = paper;
    float S = 1.2 + 1.2 * clamp(densityP, 0.0, 1.0);
    vec2 g = p * S;
    vec2 gi = floor(g);
    float T = 0.08 * sceneTime + 0.5 * audioAdvance;
    for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
        vec2 id = gi + vec2(i, j);
        float h = hash21(id);
        float cyc = T * (0.5 + 0.3 * h) + h * 5.0;
        float t = fract(cyc);
        float gen = floor(cyc);
        vec2 c = id + 0.5 + 0.2 * (hash22(id + gen * 1.7) - 0.5);
        float R = (0.25 + 0.12 * clamp(audioSpread, 0.0, 1.0)) * (0.8 + 0.4 * hash21(id + gen));
        vec2 d = g - c;
        float r = length(d);
        float a0 = hash21(id + gen * 3.1) * 6.2831853;           // start angle
        // Angle along the stroke from its start (0..2pi), continuous around the circle.
        float a = mod(atan(d.y, d.x) - a0 + 6.2831853, 6.2831853);
        float span = 6.2831853 * (0.8 - 0.15 * clamp(gapP, 0.0, 1.0));
        float drawn = smoothstep(0.0, 0.35, t) * span;          // how far the stroke has come
        float s = a / span;                                     // 0 start .. 1 end of the stroke
        // Width: heavy start, thinning to a flicking tail.
        float w = (0.03 + 0.05 * clamp(brushP, 0.0, 1.0)) * (1.2 - 0.9 * s * s) * (0.9 + 0.2 * sin(s * 9.0 + h * 5.0));
        float band = abs(r - R * (1.0 + 0.06 * sin(s * 4.0 + h * 6.0)));
        float px = fwidth(g.x) * 1.2;
        float ink = smoothstep(w + px, w - px, band) * step(a, drawn) * step(a, span);
        // Soft end of the drawn part (the brush still moving).
        ink *= smoothstep(drawn + 0.001, drawn - 0.05, a);
        // Dry brush: streaks along the stroke where the ink runs out.
        float streak = fbm3(vec2(a * 4.0, (r - R) / w * 4.0) + h * 10.0);
        float dry = smoothstep(0.3, 0.9, s) * (0.3 + 0.7 * rough);
        ink *= 1.0 - dry * smoothstep(0.45, 0.65, streak);
        // Fade out late in life.
        float fade = smoothstep(1.0, 0.7, t);
        vec3 inkC = mix(vec3(0.04, 0.05, 0.09), vec3(0.18, 0.1, 0.06), mode);
        if (hash21(id + gen * 5.0) > 0.85) inkC = mix(inkC, vec3(0.75, 0.15, 0.08), mode);   // a cinnabar seal colour now and then
        inkC = mix(inkC, glowColour(imgLod(uv, 5.0), id, hueP * 0.159) * 0.3, 0.12);
        // Wet sheen near the fresh end.
        inkC += vec3(0.5) * exp(-(drawn - a) * 3.0) * step(a, drawn) * 0.2 * kick;
        col = mix(col, inkC, ink * fade);
        // Ink bleeding into the paper around the stroke.
        col = mix(col, inkC, 0.12 * smoothstep(w * 2.5, w, band) * step(a, drawn) * fade * (1.0 - ink));
    }
    finish(col);
}
