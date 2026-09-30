//@doc
 * @brief TEXTURE CHAIN CURTAINS: curtains of hanging beads and chains, like
 * a glittering stage curtain -- thousands of small glass beads on vertical
 * strings sway in slow waves, each bead a tiny lens showing the
 * photograph behind the curtain (which glows in coloured light) upside
 * down and bright, with a crisp highlight; the strings ripple as if
 * someone just walked through, and several curtains hang one behind
 * another.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the ripple travels (integrated, jump-free)
 *   audioSpread     -> the sway amplitude
 *   audioKick       -> the highlights flash (light)
 *   audioMode       -> light behind: cool in minor, warm in major
 *   audioHigh       -> sparkle on the beads (light)
 *   audioSwell      -> the light behind (slow)
 *
 * Knobs: stringP (string spacing), beadP (bead size), layerP (curtain layers), hueP.
//@params stringP beadP layerP
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
    vec3 behind = imgK(uv, 3.0) * mix(vec3(0.7, 0.85, 1.2), vec3(1.2, 0.9, 0.65), mode) * (0.25 + 0.4 * swell);
    vec3 col = behind * 0.5;
    float T = 0.5 * sceneTime + 3.0 * audioAdvance;
    float sway = 0.01 + 0.03 * clamp(audioSpread, 0.0, 1.0);
    float nL = 1.0 + 2.0 * clamp(layerP, 0.0, 1.0);
    for (int L = 2; L >= 0; --L) {
        float fl = float(L);
        float on = smoothstep(fl - 0.5, fl + 0.5, nL - 0.5);
        if (on <= 0.0) continue;
        float sc = 1.0 + fl * 0.5;
        float sw = (0.03 + 0.03 * clamp(stringP, 0.0, 1.0)) / sc;
        // A ripple wave travelling along the curtain sideways.
        float ripple = sway * sin(p.x * 3.0 - T * 0.5 + fl) * sin(p.y * 2.0 + T * 0.3 + fl * 2.0) / sc;
        float x = p.x + ripple + fl * 0.013;
        float si = floor(x / sw);
        float sx = (x - (si + 0.5) * sw) / sw;                   // -0.5..0.5 across the string
        float bs = (0.28 + 0.15 * clamp(beadP, 0.0, 1.0));
        float yb = (p.y + hash11(si + fl * 7.0) * 3.0) / (sw * 1.05);
        float bi = floor(yb);
        vec2 bl = vec2(sx, fract(yb) - 0.5);
        float r = length(bl) / bs;
        float px = fwidth(x) / sw / bs * 1.5;
        float bead = smoothstep(1.0 + px, 1.0 - px, r);
        float string = smoothstep(0.04, 0.0, abs(sx)) * (1.0 - bead);
        // The bead lens: the view behind, flipped and bright.
        vec2 luv = uv - bl * sw * 4.0 * vec2(1.0, 1.0);
        vec3 lens = imgK(luv, 2.0) * mix(vec3(0.7, 0.85, 1.2), vec3(1.2, 0.9, 0.65), mode);
        vec3 gc = glowColour(lens, vec2(si, bi), hueP * 0.159);
        vec3 bc = mix(lens, gc, 0.3) * (0.6 + 0.6 * (1.0 - r * r)) * (0.8 + 0.4 * swell);
        // Crisp highlight and a sparkle.
        float hl = smoothstep(0.35, 0.1, length(bl / bs - vec2(-0.3, 0.35)));
        bc += vec3(1.0) * hl * (0.4 + 1.0 * kick);
        bc += vec3(1.0) * hl * hi * step(0.9, hash21(vec2(si, bi) + fl));
        bc *= 1.0 / (1.0 + fl * 0.5);
        col = mix(col, bc, bead * on);
        col = mix(col, vec3(0.25, 0.23, 0.2) / (1.0 + fl), string * on * 0.8);
    }
    finish(col);
}
