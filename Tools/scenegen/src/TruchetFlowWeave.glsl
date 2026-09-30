//@doc
 * @brief TRUCHET FLOW WEAVE: a woven fabric of glowing bands -- quarter-circle
 * Truchet tiles join into endless meandering ribbons that wind over and
 * under one another; each ribbon carries a stripe of the photograph along
 * its length, and pulses of light run along the ribbons so the whole weave
 * seems to flow.  Every so often a tile turns over and the ribbons
 * re-route (a smooth rotation, never a cut).  Endless and mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the light pulses flow along the ribbons (integrated)
 *   audioHarmChange -> tiles turn over (smoothed)
 *   audioSpread     -> ribbon width
 *   audioMode       -> the pulse colour warms in major
 *   audioKick       -> the pulses flare (light)
 *   audioSwell      -> the photo's share in the ribbons (slow)
 *
 * Knobs: scaleP (tile size), weaveP (ribbon relief), flipP (how often tiles
 * turn), hueP.  (weaveP: how rounded the ribbons look)
//@params scaleP weaveP flipP
//@audio audioHarmChange audioSpread audioMode audioKick audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float sc = 5.0 + 6.0 * clamp(scaleP, 0.0, 1.0);
    vec2 q = p * sc + vec2(0.05, 0.03) * sceneTime;
    vec2 gi = floor(q);
    float w = 0.1 + 0.12 * clamp(audioSpread, 0.0, 1.0);
    float px = sc / resolution.y * 1.5;
    float weave = clamp(weaveP, 0.0, 1.0);
    float flow = 0.5 * sceneTime + 3.0 * audioAdvance;
    vec3 pulseC = mix(vec3(0.3, 0.7, 1.0), vec3(1.0, 0.6, 0.3), clamp(audioMode, 0.0, 1.0));
    vec3 bg = vec3(0.02, 0.02, 0.03) + imgLod(q * 0.03 + 0.5, 6.0) * 0.05;
    // Each tile has two orientation states; a tile re-routes by cross-fading
    // (a turn would break the ribbons at the tile borders).
    float h = hash21(gi);
    float flipT = sceneTime * (0.02 + 0.06 * clamp(flipP, 0.0, 1.0)) + h * 10.0 + 0.5 * clamp(audioHarmChange, 0.0, 1.0);
    float fade = smoothstep(0.75, 1.0, fract(flipT));
    vec3 cols[2];
    for (int k = 0; k < 2; ++k) {
        float orient = mod(floor(flipT) + float(k), 2.0);
        vec2 gf = fract(q) - 0.5;
        if (orient > 0.5) gf.x = -gf.x;
        vec2 c1 = vec2(0.5, 0.5), c2 = vec2(-0.5, -0.5);
        float d1 = abs(length(gf - c1) - 0.5);
        float d2 = abs(length(gf - c2) - 0.5);
        float b1 = smoothstep(w + px, w - px, d1);
        float b2 = smoothstep(w + px, w - px, d2);
        // Colour and pulses from WORLD position -- continuous across tiles.
        vec3 ph = imgLod(q * 0.05 + 0.5, 1.5);
        vec3 tint = glowColour(ph, q * 0.08, hueP * 0.159);
        float pulse = pow(0.5 + 0.5 * sin(dot(q, vec2(0.9, 0.5)) * 1.3 + fbm3(q * 0.2) * 5.0 - flow), 6.0);
        float sh1 = sqrt(max(1.0 - d1 * d1 / (w * w), 0.0));
        float sh2 = sqrt(max(1.0 - d2 * d2 / (w * w), 0.0));
        vec3 base = mix(tint * 0.8, ph * 1.2, 0.25 + 0.3 * swell);
        float dep = 0.3 + 0.6 * weave;
        vec3 r1 = base * mix(1.0, 0.25 + 0.75 * sh1, dep) + pulseC * pulse * (0.8 + 1.2 * kick) * sh1;
        vec3 r2 = base * mix(1.0, 0.25 + 0.75 * sh2, dep) + pulseC * pulse * (0.8 + 1.2 * kick) * sh2;
        vec3 c = mix(bg, r2, b2);
        c = mix(c, r1, b1);
        cols[k] = c;
    }
    vec3 col = mix(cols[0], cols[1], fade);
    finish(col);
}
