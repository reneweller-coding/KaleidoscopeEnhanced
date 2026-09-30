//@doc
 * @brief TEXTURE BOKEH STREAMS: rivers of out-of-focus lights -- like city
 * traffic seen through a defocused lens at night, streams of soft
 * glowing discs flow along gently curving lanes across the view, near
 * ones large and faint, far ones small and bright, each disc with the
 * faint ring and cat's-eye shape of a real lens; the colours come from
 * the photograph (warm red tail lights, white headlights, its own hues).
 * Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the streams flow (integrated, jump-free)
 *   audioSpread     -> the defocus (disc size)
 *   audioKick       -> the discs brighten (light)
 *   audioMode       -> palette: cool city in minor, warm traffic in major
 *   audioHigh       -> sparkles on the near discs (light)
 *   audioSwell      -> haze (slow)
 *
 * Knobs: laneP (lane count), densityP (lights per lane), curveP (lane curvature), hueP.
//@params laneP densityP curveP
//@audio audioSpread audioKick audioMode audioHigh audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float T = 0.15 * sceneTime + 1.0 * audioAdvance;
    vec3 col = vec3(0.01, 0.012, 0.02) + imgLod(p * 0.5 + 0.5, 5.0) * 0.03 * (0.5 + swell);
    float defocus = 0.6 + 0.8 * clamp(audioSpread, 0.0, 1.0);
    float curv = 0.1 + 0.3 * clamp(curveP, 0.0, 1.0);
    for (int L = 0; L < 3; ++L) {
        float fl = float(L);                                    // 0 near .. 2 far
        float depth = 1.0 + fl * 0.8;
        float nL = 3.0 + 3.0 * clamp(laneP, 0.0, 1.0);
        // Lane coordinate: y bent by a slow curve.
        float y = p.y * depth + curv * sin(p.x * 1.2 * depth + fl * 2.0 + 0.05 * sceneTime);
        float lane = floor(y * nL / 2.0 + 0.5);
        float ly = y - lane * 2.0 / nL;
        float dir = mod(lane, 2.0) < 0.5 ? 1.0 : -1.0;
        float speed = (0.6 + 0.4 * hash11(lane + fl * 7.0)) * dir;
        float x = p.x * depth + T * speed * (1.2 - 0.3 * fl);
        float cell = 0.35 - 0.15 * clamp(densityP, 0.0, 1.0);
        float ci = floor(x / cell);
        float R = (0.05 + 0.05 / depth) * defocus;
        for (int k = -1; k <= 1; ++k) {
            float c = ci + float(k);
            float h = hash21(vec2(c, lane + fl * 13.0));
            if (h > 0.7) continue;
            vec2 ctr = vec2((c + 0.5 + 0.3 * (hash21(vec2(lane, c) + 2.0) - 0.5)) * cell, 0.0);
            vec2 d = vec2(x, ly * 1.0) - ctr - vec2(0.0, (hash21(vec2(c, lane) + 5.0) - 0.5) * 0.3 / nL);
            // Cat's-eye: discs toward the edge of the frame are clipped by a second circle.
            vec2 cat = p * 0.25;
            float dd = max(length(d), length(d + cat * R * 4.0) * 0.95);
            float disc = smoothstep(R, R * 0.9, dd);
            float ring = smoothstep(R * 0.8, R, dd) * disc;
            vec3 pc = glowColour(imgLod(vec2(hash21(vec2(c, lane)), hash21(vec2(lane, c + 3.0))), 3.0), vec2(c, lane), hueP * 0.159);
            vec3 traffic = dir > 0.0 ? vec3(1.0, 0.25, 0.1) : vec3(1.0, 0.95, 0.85);
            vec3 lc = mix(mix(pc, vec3(0.5, 0.7, 1.0) * luma(pc) * 2.0, 0.4), mix(pc, traffic, 0.6), mode);
            float I = (0.25 + 0.35 * fl) * (1.0 + 0.8 * kick) * (0.7 + 0.3 * sin(sceneTime * (0.5 + h) + h * 6.28));
            col += lc * (disc * 0.6 + ring * 0.5) * I;
            col += vec3(1.0) * ring * hi * 0.3 * step(fl, 0.5);
        }
    }
    col = mix(col, vec3(0.08, 0.09, 0.12), 0.15 * swell);
    finish(col);
}
