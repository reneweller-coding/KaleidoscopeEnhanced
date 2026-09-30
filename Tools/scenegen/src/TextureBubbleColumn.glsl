//@doc
 * @brief TEXTURE BUBBLE COLUMN: columns of rising bubbles in a dark aquarium
 * -- streams of bubbles of every size well up from below in wavering
 * columns, big ones wobbling and flattening as they rise, small ones
 * racing in tight spirals, each bubble a little mirror with a bright rim
 * and a highlight, catching and bending the coloured light of the
 * photograph behind the glass.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the bubbles rise (integrated, jump-free)
 *   audioSpread     -> the columns spread into plumes
 *   audioKick       -> the rims flash (light)
 *   audioMode       -> the water: blue in minor, green-gold in major
 *   audioHigh       -> the small bubbles sparkle (light)
 *   audioSwell      -> the light behind (slow)
 *
 * Knobs: columnP (column spacing), sizeP (bubble size), lensP (lens effect), hueP.
//@params columnP sizeP lensP
//@audio audioSpread audioKick audioMode audioHigh audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    vec3 waterC = mix(vec3(0.1, 0.25, 0.5), vec3(0.2, 0.45, 0.3), mode);
    vec2 uv = p * 0.5 + 0.5;
    vec3 behind = imgLod(uv, 3.0);
    vec3 col = mix(waterC * 0.15, behind * waterC * 1.5, 0.3 + 0.4 * swell);
    float T = 0.25 * sceneTime + 1.5 * audioAdvance;
    float cw = 0.25 + 0.3 * clamp(columnP, 0.0, 1.0);
    float plume = 0.02 + 0.08 * clamp(audioSpread, 0.0, 1.0);
    float pxs = 1.5 / resolution.y;
    for (int L = 0; L < 3; ++L) {
        float fl = float(L);                                    // bubble size class: 0 big .. 2 small
        float R = (0.035 - 0.009 * fl) * (0.7 + 0.6 * clamp(sizeP, 0.0, 1.0));
        float spacing = R * 3.2;
        float colI = floor(p.x / cw + fl * 0.33);
        for (int k = -1; k <= 1; ++k) {
            float ci = colI + float(k);
            float h = hash11(ci * 1.37 + fl * 5.0);
            if (h > 0.7) continue;
            float cx = (ci + 0.5 - fl * 0.33) * cw + 0.08 * sin(p.y * 2.0 + h * 6.28 + T * 0.3);
            float speed = (1.0 + 0.8 * fl) * (0.7 + 0.6 * h);
            float y = p.y + T * speed * 0.3;
            float bi = floor(y / spacing);
            for (int m = -1; m <= 1; ++m) {
                float b = bi + float(m);
                float hb = hash21(vec2(b, ci + fl * 17.0));
                if (hb > 0.75) continue;
                float wob = plume * (hb - 0.5) * 2.0 + (0.01 + 0.02 * fl) * sin(b * 1.7 + T * (3.0 + fl * 3.0));
                vec2 c = vec2(cx + wob, (b + 0.5) * spacing - T * speed * 0.3);
                vec2 d = p - c;
                float Rb = R * (0.7 + 0.6 * hash21(vec2(ci, b) + 3.0));
                // Big bubbles flatten and wobble.
                d.y *= 1.0 + (0.25 - 0.1 * fl) * (0.5 + 0.5 * sin(T * 4.0 + b));
                float r = length(d) / Rb;
                if (r > 1.3) continue;
                float inside = smoothstep(1.0 + pxs / Rb, 1.0 - pxs / Rb, r);
                // Lens: the photo behind, flipped and squeezed.
                vec3 lensC = imgLod(uv - d * (2.0 + 4.0 * clamp(lensP, 0.0, 1.0)), 2.0) * waterC * 1.8;
                float rim = smoothstep(0.75, 1.0, r) * inside;
                float hl = smoothstep(0.35, 0.1, length(d / Rb - vec2(-0.35, 0.35)));
                vec3 bc = mix(lensC * 0.6, mix(waterC, vec3(1.0), 0.6), rim * (0.7 + 0.8 * kick)) + vec3(1.0) * hl * (0.6 + hi * step(1.5, fl) * 1.0);
                col = mix(col, bc, inside);
            }
        }
    }
    col = mix(col, col * glowColour(behind, p, hueP * 0.159) * 1.3, 0.06);
    finish(col);
}
