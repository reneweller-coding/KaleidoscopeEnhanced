//@doc
 * @brief TEXTURE FLOATING LIGHTS: a night festival of floating lanterns on a
 * dark lake -- hundreds of small paper lanterns drift on the water in
 * slow currents, each glowing warm from within, its reflection wavering
 * beneath it in the ripples, the far ones tiny sparks near the horizon;
 * the lanterns take their tints from the photograph, which also shows
 * faintly as the far shore's lights reflected in the lake.  Endless
 * sideways, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the lanterns drift (integrated, jump-free)
 *   audioSpread     -> the current spreads them
 *   audioKick       -> the lanterns flare (light)
 *   audioMode       -> the light: pale blue in minor, warm amber in major
 *   audioRoughness  -> ripples on the lake
 *   audioSwell      -> the glow on the water (slow)
 *
 * Knobs: densityP (lanterns), sizeP (lantern size), shoreP (photo lights on the shore), hueP.
//@params densityP sizeP shoreP
//@audio audioSpread audioKick audioMode audioRoughness audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    float horizon = 0.28;
    vec3 warm = mix(vec3(0.6, 0.75, 1.0), vec3(1.0, 0.62, 0.25), mode);
    vec3 col;
    float yy = p.y - horizon;
    // Sky and shore above the horizon.
    vec3 sky = vec3(0.01, 0.015, 0.04) + vec3(0.02, 0.02, 0.05) * smoothstep(0.4, 0.0, yy);
    vec2 suv = vec2(p.x * 0.5 + 0.5 + 0.002 * sceneTime, 0.3);
    vec3 shore = imgLod(suv + vec2(0.0, max(yy, 0.0) * 2.0), 2.0);
    float shoreBand = smoothstep(0.06, 0.0, yy) * step(0.0, yy);
    col = sky + neonOf(shore + 1e-3, 1.5) * shoreBand * 0.25 * clamp(shoreP + 0.2, 0.0, 1.2);
    // Water-plane quantities computed unconditionally (derivatives must not
    // live in a pixel-dependent branch).
    float d = 0.3 / max(-yy, 0.005);
    float T = 0.05 * sceneTime + 0.35 * audioAdvance;
    vec2 w = vec2(p.x * d, d);                                   // water plane coordinates
    float spread = 0.5 + 0.8 * clamp(audioSpread, 0.0, 1.0);
    w.x += 0.2 * spread * sin(w.y * 0.3 + T);
    vec2 g = w * vec2(1.4, 1.0) * (0.8 + 0.8 * (1.0 - clamp(sizeP, 0.0, 1.0))) + vec2(T * 0.6, -T * 1.2);
    float pxw = fwidth(g.x) + 1e-4;
    if (yy < 0.0) {
        // The lake: ripples distort the reflection.
        float rip = (0.004 + 0.012 * rough) * sin(d * 20.0 + 1.5 * sceneTime + p.x * 30.0) * (1.0 + 0.5 * noise2(vec2(p.x * 20.0, d * 3.0)));
        vec2 ruv = vec2(p.x * 0.5 + 0.5 + rip * 3.0, 0.3 - yy * 2.0);
        vec3 refl = neonOf(imgLod(ruv, 2.5) + 1e-3, 1.5) * smoothstep(0.1, 0.0, -yy) * 0.15 * clamp(shoreP + 0.2, 0.0, 1.2);
        col = vec3(0.005, 0.008, 0.02) + refl;
        // Lanterns: on a perspective grid over the water plane.
        // Each lantern stands upright on the water: find its screen footprint
        // from its plane position (cells around the pixel's plane point; the
        // search reaches one cell further toward the viewer, where lanterns are tall).
        vec2 gi = floor(g);
        float gs = 1.4 * (0.8 + 0.8 * (1.0 - clamp(sizeP, 0.0, 1.0)));
        for (int j = -2; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
            vec2 id = gi + vec2(i, j);
            float h = hash21(id);
            if (h > 0.25 + 0.5 * clamp(densityP, 0.0, 1.0)) continue;
            vec2 c = id + 0.5 + 0.3 * (hash22(id + 2.0) - 0.5);
            // Back to the water plane, then to the screen.
            vec2 wc = (c - vec2(T * 0.6, -T * 1.2)) / vec2(gs, gs / 1.4);
            float dz = wc.y;
            if (dz < 0.5) continue;
            float wx = wc.x - 0.2 * spread * sin(dz * 0.3 + T);
            vec2 base = vec2(wx / dz, horizon - 0.3 / dz);
            float S = 0.12 / dz;                                   // lantern height on screen
            float bob = 0.1 * S * sin(sceneTime * 1.3 + h * 6.28);
            vec2 lb = (p - base - vec2(0.0, S * 0.55 + bob)) / S;
            float px = pxw / gs * dz / S * 0.0 + 1.5 / resolution.y / S;
            // Paper lantern: slightly barrel-shaped, dark caps top and bottom, glowing core.
            float barrel = abs(lb.x) * (1.35 + 0.5 * lb.y * lb.y);
            float body = smoothstep(0.5 + px, 0.5 - px, max(barrel, abs(lb.y)));
            float cap = smoothstep(0.38, 0.42, abs(lb.y));
            float glowIn = (1.0 - 0.6 * length(lb * vec2(1.6, 1.0))) * (1.0 - 0.85 * cap);
            vec2 lr = (p - base + vec2(0.0, S * 0.55 + bob)) / S;
            lr.x += rip * 8.0 / S * 0.1;
            float reflB = smoothstep(0.7, 0.1, length(lr * vec2(1.3, 0.7)));
            vec3 lc = mix(warm, glowColour(imgLod(hash22(id + 5.0), 4.0), id, hueP * 0.159), 0.35);
            float flick = 0.85 + 0.15 * sin(sceneTime * (3.0 + 4.0 * h) + h * 30.0);
            float far = smoothstep(40.0, 15.0, dz);
            col += lc * body * max(glowIn, 0.05) * flick * (1.4 + 1.5 * kick) * far;
            col += lc * reflB * 0.25 * flick * (0.6 + 0.8 * swell) * far;
            col += lc * exp(-length(p - base - vec2(0.0, S * 0.5)) / S * 1.5) * 0.08 * (0.5 + swell) * far;
        }
        // Distance haze.
        col = mix(col, sky * 1.5 + warm * 0.02, smoothstep(10.0, 40.0, d));
    }
    finish(col);
}
