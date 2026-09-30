//@doc
 * @brief TEXTURE SPILL BLOOM: watercolour spilled on wet paper, blooming --
 * the photograph's colours flow into the wet sheet as soft cauliflower
 * blooms ("backruns"), each bloom pushing pigment to its edge where it dries
 * into a dark, crisp, lacy line, paler pigment left inside; blooms keep
 * opening into each other, and granulating pigment settles into the paper's
 * grain.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the blooms spread (integrated, jump-free)
 *   audioHarmChange -> new blooms open (smoothed)
 *   audioSpread     -> bloom size
 *   audioRoughness  -> the bloom edges get more cauliflower-like
 *   audioSwell      -> pigment strength (slow)
 *   audioMode       -> the pigment set warms in major
 *
 * Knobs: bloomsP, granP (granulation), edgeP (edge darkness), hueP.
//@params bloomsP granP edgeP
//@audio audioHarmChange audioSpread audioRoughness audioSwell audioMode
//@body
void main()
{
    vec2 p = screenP();
    float swell = clamp(audioSwell, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    float T = 0.035 * sceneTime + 0.3 * audioAdvance + 0.08 * clamp(audioHarmChange, 0.0, 1.0);
    vec3 paper = vec3(0.96, 0.95, 0.91) * (0.96 + 0.04 * noise2(p * 250.0));
    vec3 col = paper;
    float edgeAcc = 0.0;
    float size = 0.5 + 0.4 * clamp(audioSpread, 0.0, 1.0);
    for (int L = 0; L < 3; ++L) {
        float fl = float(L);
        float gen = floor(T + fl / 3.0);
        float life = fract(T + fl / 3.0);
        vec2 q = p / size + hash22(vec2(gen, fl)) * 9.0;
        vec2 gi = floor(q);
        for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
            vec2 id = gi + vec2(i, j);
            if (hash21(id + gen * 2.3) > 0.4 + 0.4 * clamp(bloomsP, 0.0, 1.0)) continue;
            vec2 c = id + 0.5 + 0.3 * (hash22(id + gen) - 0.5);
            vec2 d = q - c;
            float ang = atan(d.y, d.x);
            vec2 dv = vec2(cos(ang), sin(ang));
            // Cauliflower edge: noise on the circle at two scales.
            float R = (0.2 + 0.6 * smoothstep(0.0, 0.7, life)) * (0.7 + 0.4 * hash21(id + 4.0));
            float edgeN = 0.15 * (fbm3(dv * 2.0 + id) - 0.5) + (0.05 + 0.1 * rough) * (fbm3(dv * 7.0 + id + 3.0) - 0.5);
            float r = length(d) / R + edgeN;
            float inside = smoothstep(1.0, 0.96, r);
            vec3 ph = imgLod(id * 0.09 + gen * 0.13 + 0.5, 4.0);
            float h = (satOf(ph) > 0.2 ? hue_of(ph) : hueP * 0.159 + hash21(id) * 0.4) + 0.05 * clamp(audioMode, 0.0, 1.0);
            vec3 pig = hsv2rgb(vec3(fract(h), 0.5 + 0.35 * swell, 0.9));
            // Pale inside, darker toward the rim (pigment pushed out).
            float load = mix(0.35, 0.8, smoothstep(0.2, 0.95, r));
            float fade = smoothstep(0.0, 0.06, life) * smoothstep(1.0, 0.75, life);
            col = mix(col, col * mix(vec3(1.0), pig, load), inside * fade);
            edgeAcc = max(edgeAcc, exp(-pow((r - 0.98) / 0.02, 2.0)) * fade);
        }
    }
    // Dried edges.
    col *= 1.0 - (0.3 + 0.4 * clamp(edgeP, 0.0, 1.0)) * edgeAcc;
    // Granulation: pigment settling in the paper grain.
    float gran = noise2(p * 180.0) * noise2(p * 60.0 + 3.0);
    col *= 1.0 - 0.25 * clamp(granP, 0.0, 1.0) * gran * (1.0 - luma(col));
    finish(col);
}
