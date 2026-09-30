//@doc
 * @brief TEXTURE CHROMATOGRAPHY RINGS: paper chromatography, circle after
 * circle -- on filter paper, drops of ink spread outward as solvent
 * soaks through, and each ink separates into rings of its component
 * pigments (a black splitting into violet, blue, yellow and pink bands),
 * with feathered, spiky outer fronts; the paper takes its tone from the
 * photograph.  Many spots overlap across the endless sheet and slowly
 * develop anew.  Mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the solvent spreads (integrated, jump-free)
 *   audioSpread     -> spot size
 *   audioKick       -> the wet front glistens (light)
 *   audioMode       -> the inks: cool (blue-violet) in minor, warm (red-orange) in major (tint)
 *   audioRoughness  -> the front gets spikier
 *   audioSwell      -> ring intensity (slow)
 *
 * Knobs: spotP (spot density), bandP (bands per spot), paperP (photo in the paper), hueP.
//@params spotP bandP paperP
//@audio audioSpread audioKick audioMode audioRoughness audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    vec2 uv = p * 0.5 + 0.5;
    vec3 paper = vec3(0.96, 0.95, 0.92) * (0.97 + 0.03 * fbm3(p * 60.0));
    paper = mix(paper, paper * (0.75 + 0.35 * imgLod(uv, 3.0)), 0.3 * clamp(paperP, 0.0, 1.0));
    vec3 col = paper;
    float T = 0.04 * sceneTime + 0.3 * audioAdvance;
    float S = 1.4 + 1.2 * clamp(spotP, 0.0, 1.0);
    vec2 g = p * S;
    vec2 gi = floor(g);
    for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
        vec2 id = gi + vec2(i, j);
        float h = hash21(id);
        float cyc = T * (0.5 + 0.4 * h) + h * 3.0;
        float life = fract(cyc);
        float gen = floor(cyc);
        vec2 c = id + 0.5 + 0.3 * (hash22(id + gen * 1.7) - 0.5);
        float R = (0.3 + 0.2 * clamp(audioSpread, 0.0, 1.0)) * (0.6 + 0.5 * hash21(id + gen)) * sqrt(smoothstep(0.0, 0.7, life));
        vec2 d = g - c;
        float ang = atan(d.y, d.x);
        vec2 u = vec2(cos(ang), sin(ang));
        float spikes = (0.04 + 0.12 * rough) * (noise2(u * 20.0 + h * 9.0) - 0.5) + 0.05 * (fbm3(u * 3.0 + gen) - 0.5);
        float rr = length(d) / max(R, 1e-3) + spikes;
        if (rr > 1.2) continue;
        float alpha = smoothstep(0.0, 0.08, life) * smoothstep(1.0, 0.8, life);
        // Bands: pigments separated by how far they travel.
        float nb = 3.0 + 3.0 * clamp(bandP, 0.0, 1.0);
        float bi = floor(rr * nb);
        float bf = fract(rr * nb);
        float hk = fract(h * 3.7 + bi * 0.23 + gen * 0.11 + hueP * 0.159);
        vec3 pig = hsv2rgb(vec3(fract(mix(0.6, 0.0, mode) + (hk - 0.5) * 0.5), 0.75, 0.9));
        pig = mix(pig, glowColour(imgLod(hash22(id + gen), 4.0), id, hueP * 0.159), 0.2);
        // Each band is darkest at its outer edge (the pigment front).
        float dens = (0.3 + 0.5 * smoothstep(0.3, 1.0, bf)) * (0.6 + 0.6 * swell) * step(rr, 1.0);
        col *= mix(vec3(1.0), pig, dens * alpha);
        // Wet solvent front.
        col += vec3(1.0) * exp(-abs(rr - 1.0) * 30.0) * (1.0 - smoothstep(0.0, 0.7, life)) * 0.08 * (1.0 + 2.0 * kick) * alpha;
        col *= 1.0 - 0.12 * exp(-abs(rr - 1.0) * 40.0) * alpha;   // a faint tide line
    }
    finish(col);
}
