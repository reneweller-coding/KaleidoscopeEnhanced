//@doc
 * @brief TEXTURE RAIN TRICKLE: rain running down a window at night -- the
 * photograph outside is blurred into soft coloured lights by the wet
 * glass, and rivulets of water snake down it, each rivulet a sharp lens
 * showing the scene clearly (flipped and bright) inside its narrow
 * channel, with a fat drop at its head that pauses, gathers, and then
 * runs on; tiny beads cover the rest of the pane.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the drops run down (integrated, jump-free)
 *   audioSpread     -> the rivulets meander more
 *   audioKick       -> the drop highlights flash (light)
 *   audioMode       -> the night outside: cool in minor, warm in major (tint)
 *   audioHigh       -> the beads sparkle (light)
 *   audioSwell      -> the blur of the outside (slow)
 *
 * Knobs: rivuletP (rivulet count), beadP (bead density), clarityP (sharpness in the channels), hueP.
//@params rivuletP beadP clarityP
//@audio audioSpread audioKick audioMode audioHigh audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    vec2 uv = p * 0.5 + 0.5;
    vec3 tint = mix(vec3(0.8, 0.9, 1.1), vec3(1.1, 0.9, 0.75), mode);
    vec3 outside = imgK(uv, 3.5 + 1.5 * swell) * tint;
    vec3 col = outside * 0.8;
    float T = 0.15 * sceneTime + 1.0 * audioAdvance;
    // Rivulets: meandering vertical channels.
    float cw = 0.12 + 0.12 * (1.0 - clamp(rivuletP, 0.0, 1.0));
    float ci = floor(p.x / cw);
    float chan = 0.0; vec2 lensOff = vec2(0.0); float head = 0.0;
    for (int k = -1; k <= 1; ++k) {
        float c = ci + float(k);
        float h = hash11(c * 1.37);
        if (h > 0.6) continue;
        float mea = (0.02 + 0.04 * clamp(audioSpread, 0.0, 1.0));
        float x0 = (c + 0.5) * cw + mea * (sin(p.y * 7.0 + h * 20.0) + 0.5 * sin(p.y * 17.0 + h * 9.0));
        float w = 0.004 + 0.004 * h;
        float d = abs(p.x - x0);
        // The rivulet exists above its head; the head moves down in stop-and-go steps (smooth).
        float cyc = T * (0.3 + 0.3 * h) + h * 5.0;
        float stepT = floor(cyc) + smoothstep(0.3, 1.0, fract(cyc));     // pause, then run (continuous)
        float run = mod(stepT * 0.35, 1.8);
        float headY = 0.8 - run;
        // The rivulet fades before its head wraps back to the top (no jump).
        float rvFade = smoothstep(1.8, 1.45, run) * smoothstep(0.0, 0.1, run);
        float above = smoothstep(headY - 0.01, headY + 0.02, p.y) * smoothstep(1.0, 0.7, p.y - headY);
        float inC = smoothstep(w, w * 0.5, d) * above * rvFade;
        if (inC > chan) { chan = inC; lensOff = vec2((p.x - x0) / w, 0.0); }
        // The drop at the head: a round lens.
        vec2 hd = vec2(p.x - x0, (p.y - headY) * 0.8);
        float R = w * 2.8;
        float hr = length(hd) / R;
        float hdrop = smoothstep(1.0, 0.85, hr) * rvFade;
        if (hdrop > head) { head = hdrop; lensOff = hd / R; }
    }
    // Through the water: the scene sharp, flipped, brighter.
    float clar = clamp(clarityP, 0.0, 1.0);
    vec3 sharp = imgK(uv - lensOff * 0.03, 1.5 - clar) * tint * 1.3;
    col = mix(col, sharp, max(chan, head));
    // Head highlight.
    col += vec3(1.0) * smoothstep(0.35, 0.1, length(lensOff - vec2(-0.35, 0.35))) * head * (0.4 + 1.0 * kick);
    col *= 1.0 - 0.3 * smoothstep(0.7, 1.0, length(lensOff)) * head;   // dark rim of the drop
    // Beads everywhere else.
    vec2 g = p * 60.0;
    vec2 gi = floor(g);
    vec2 bc = 0.25 + 0.5 * hash22(gi);
    float br = 0.1 + 0.2 * hash21(gi + 1.0);
    float bd = length(fract(g) - bc) / br;
    float bead = step(hash21(gi + 2.0), 0.3 + 0.5 * clamp(beadP, 0.0, 1.0)) * smoothstep(1.0, 0.8, bd) * (1.0 - max(chan, head));
    vec3 bv = imgK(uv - (fract(g) - bc) * 0.02, 2.0) * tint * 1.2;
    col = mix(col, bv, bead * 0.7);
    col += vec3(1.0) * bead * smoothstep(0.4, 0.1, length((fract(g) - bc) / br - vec2(-0.3, 0.3))) * (0.15 + 0.6 * hi);
    col = mix(col, col * glowColour(outside, p, hueP * 0.159) * 1.2, 0.05);
    finish(col);
}
