//@doc
 * @brief BUBBLE OIL LAMP: a wall of glowing bubble-tube lamps -- tall
 * columns of coloured liquid, lit from below, through which strings of
 * bubbles rise, wobbling, speeding up and slowing, each bubble a little
 * lens flashing with the light and bending the colours behind it; the
 * liquids take their colours from the photograph and glow softly into
 * each other, the photo faintly visible as the room reflected in the
 * glass.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the bubbles rise (integrated, jump-free)
 *   audioSpread     -> bubble size
 *   audioBass       -> the lamps glow brighter (light)
 *   audioHigh       -> the bubbles flash (light)
 *   audioMode       -> liquid colours: cool in minor, warm in major
 *   audioSwell      -> the glass reflection (slow)
 *
 * Knobs: tubeP (tube width), bubbleP (bubble density), glowP, hueP.
//@params tubeP bubbleP glowP
//@audio audioSpread audioBass audioHigh audioMode audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float bass = clamp(audioBass, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float tw = 0.12 + 0.12 * clamp(tubeP, 0.0, 1.0);           // tube width
    float x = p.x / tw;
    float ti = floor(x);
    float tx = fract(x) - 0.5;                                  // -0.5..0.5 across the tube
    // Liquid colour per tube from the photo.
    vec3 lc = glowColour(imgLod(vec2(hash11(ti * 0.37), hash11(ti * 0.71 + 3.0)), 4.0), vec2(ti * 0.4, 0.0), hueP * 0.159 + hash11(ti) * 0.4);
    lc = mix(lc, lc * mix(vec3(0.75, 0.9, 1.2), vec3(1.2, 0.9, 0.7), mode), 0.5);
    // Glass cylinder shading: bright core, darker toward the walls.
    float cyl = sqrt(max(0.0, 1.0 - (tx * 2.1) * (tx * 2.1)));
    float glow = (0.35 + 0.5 * clamp(glowP, 0.0, 1.0)) * (0.8 + 0.5 * bass);
    // Light from below fades upward (mirrored endlessly: a slow wave).
    float lightY = 0.7 + 0.3 * sin(p.y * 1.5 + hash11(ti) * 6.28 + 0.1 * sceneTime);
    vec3 col = lc * cyl * glow * lightY;
    // Bubbles: strings rising in each tube.
    float rise = 0.15 * sceneTime + 1.0 * audioAdvance;
    float bs = (0.1 + 0.08 * clamp(audioSpread, 0.0, 1.0));
    for (int s = 0; s < 2; ++s) {
        float fs = float(s);
        float sp = (0.7 + 0.6 * hash11(ti * 1.3 + fs)) * rise;
        float y = p.y / tw + sp * 4.0 + fs * 0.37;
        float cell = 0.6 + 0.8 * (1.0 - clamp(bubbleP, 0.0, 1.0));
        float by = y / cell;
        float bi = floor(by);
        for (int k = -1; k <= 1; ++k) {
            float b = bi + float(k);
            float h = hash21(vec2(b, ti * 3.0 + fs));
            if (h > 0.75) continue;
            float wob = 0.12 * sin(b * 2.3 + sceneTime * 3.0 * (0.5 + h));
            vec2 c = vec2(wob + (fs - 0.5) * 0.12, (b + 0.5 + 0.2 * (h - 0.5)) * cell);
            float rad = bs * (0.6 + 0.8 * h) / tw * 0.12 * 1.6;
            vec2 d = vec2(tx, y) - c;
            float dl = length(d / vec2(1.0, 0.85));
            if (dl < rad * 1.4) {
                float inside = smoothstep(rad, rad * 0.85, dl);
                // The bubble: darker body (lens flips the light), bright rim, highlight.
                vec3 bc = lc * 0.35 + lc * smoothstep(rad * 0.5, rad, dl) * 0.8;
                bc += vec3(1.0) * smoothstep(0.35, 0.0, length(d - vec2(-0.3, 0.3) * rad) / rad) * (0.4 + 1.0 * hi);
                col = mix(col, bc * glow * 1.4, inside);
            }
        }
    }
    // Dark gaps between the tubes, glass edge highlights.
    float gap = smoothstep(0.5, 0.46, abs(tx));
    col *= gap;
    col += vec3(1.0) * exp(-abs(abs(tx) - 0.43) / 0.012) * 0.12;
    // The room reflected in the glass.
    col += imgLod(p * 0.5 + 0.5, 2.0) * (0.02 + 0.08 * swell) * gap;
    finish(col);
}
