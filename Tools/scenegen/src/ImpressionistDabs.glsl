//@doc
 * @brief IMPRESSIONIST DABS: the photograph repainted in short broken
 * brushstrokes, Monet-style -- every stroke a small comma of paint laid
 * along the picture's forms, its colour taken from the photo but split
 * into pure touches (a warm and a cool neighbour hue side by side), with
 * thick impasto edges catching the light; the strokes slowly shimmer and
 * re-lay as the light of the day changes, the picture drifting beneath.
 * Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the picture drifts and the strokes re-lay (integrated)
 *   audioSpread     -> stroke length
 *   audioKick       -> the impasto highlights flare (light)
 *   audioMode       -> the light of the day: blue morning in minor, golden afternoon in major
 *   audioRoughness  -> the colour splitting (more broken colour)
 *   audioSwell      -> the canvas showing between strokes (slow)
 *
 * Knobs: dabP (stroke size), flowP (strokes follow forms), vividP (colour intensity), hueP.
//@params dabP flowP vividP
//@audio audioSpread audioKick audioMode audioRoughness audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    vec2 drift = vec2(0.004, 0.002) * sceneTime + vec2(0.03, 0.01) * audioAdvance;
    float S = 40.0 + 40.0 * (1.0 - clamp(dabP, 0.0, 1.0));
    vec2 g = p * S;
    vec2 gi = floor(g);
    vec3 canvas = vec3(0.88, 0.84, 0.75);
    vec3 col = canvas * (0.9 + 0.1 * noise2(p * 400.0));
    float best = 1e3;
    float len = 0.9 + 0.9 * clamp(audioSpread, 0.0, 1.0);
    float T = 0.05 * sceneTime + 0.3 * audioAdvance;
    for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
        vec2 id = gi + vec2(i, j);
        for (int k = 0; k < 2; ++k) {
            float fk = float(k);
            vec2 hh = hash22(id + fk * 7.3);
            // Strokes re-lay slowly: each has a life cycle, fading as a new one appears.
            float cyc = T * (0.5 + 0.5 * hh.x) + hh.y * 3.0;
            float life = fract(cyc);
            float gen = floor(cyc);
            vec2 c = id + hash22(id + gen * 1.3 + fk * 3.1);
            vec2 cw = c / S;
            vec2 uv = cw * 0.6 + 0.5 + drift;
            vec3 ph = imgLod(uv, 2.0);
            // Direction: along the forms (perpendicular to the gradient), plus a painter's tilt.
            vec2 gr = texGrad(uv, 3.5);
            float ang = atan(gr.x, -gr.y) * clamp(flowP + 0.2, 0.0, 1.0) + 0.6 * (1.0 - clamp(flowP, 0.0, 1.0)) + (hh.x - 0.5) * 0.6;
            vec2 d = rot2(-ang) * (g - c);
            float L = len * (0.6 + 0.5 * hh.y), W = 0.3 + 0.15 * hh.x;
            // Comma shape: a capsule thicker at the start.
            float tpos = clamp(d.x / L + 0.5, 0.0, 1.0);
            float wd = W * (1.1 - 0.5 * tpos);
            float sd = length(vec2(max(abs(d.x) - L * 0.5, 0.0), d.y)) - wd;
            float alpha = smoothstep(0.0, 0.1, life) * smoothstep(1.0, 0.8, life);
            // Colour: the photo's colour split into a warm or a cool touch.
            float sp = (0.05 + 0.12 * rough) * (fk * 2.0 - 1.0);
            vec3 hsvC = vec3(hue_of(ph) + sp, clamp(satOf(ph) * (1.2 + 0.8 * clamp(vividP, 0.0, 1.0)), 0.0, 1.0), max(max(ph.r, ph.g), ph.b));
            vec3 pc = hsv2rgb(vec3(fract(hsvC.x + hueP * 0.159 * 0.2), hsvC.y, hsvC.z));
            pc *= mix(vec3(0.85, 0.92, 1.1), vec3(1.12, 0.98, 0.82), mode);
            float px = fwidth(g.x);
            float inside = smoothstep(px, -px, sd) * alpha;
            // Stack: later (higher score) strokes over earlier ones.
            float score = hash21(id + fk + gen * 0.1);
            if (inside > 0.01 && score < best + 2.0) {
                // Impasto: ridge along the stroke's edge, lit from the upper left.
                float edge = smoothstep(-0.12, 0.0, sd);
                vec3 paint = pc * (0.85 + 0.25 * noise2(d * vec2(3.0, 12.0) + id));
                paint += vec3(1.0) * edge * max(0.0, dot(normalize(vec2(d.y, 0.3)), vec2(-0.7, 0.7))) * (0.1 + 0.4 * kick);
                col = mix(col, paint, inside * (1.0 - 0.4 * swell * (1.0 - smoothstep(-0.3, -0.1, sd))));
                best = min(best, score);
            }
        }
    }
    finish(col);
}
