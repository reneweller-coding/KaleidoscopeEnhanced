//@doc
 * @brief OIL WHEEL MACRO: a close-up of the rotating liquid wheel of a
 * vintage oil projector -- between two glass discs, coloured oils and
 * water slowly churn as the wheel turns: big lens-like bubbles of clear
 * oil drift through pools of saturated dye, stretching into long curved
 * streaks along the rotation, their edges glowing where the light
 * refracts, air bubbles glinting; the dye colours come from the
 * photograph.  The wheel's centre sits off-screen so the flow sweeps
 * across in arcs.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the wheel turns (integrated, jump-free)
 *   audioSpread     -> the oils stretch into longer streaks
 *   audioBass       -> the projector lamp (light)
 *   audioMode       -> palette: cool in minor, warm in major (tint)
 *   audioRoughness  -> the oils break into smaller droplets
 *   audioSwell      -> the lens bubbles grow (slow)
 *
 * Knobs: bubbleP (lens bubbles), dyeP (dye saturation), photoP (photo colours), hueP.
//@params bubbleP dyeP photoP
//@audio audioSpread audioBass audioMode audioRoughness audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float bass = clamp(audioBass, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    // Wheel coordinates: centre far below-left, so the flow sweeps in arcs.
    vec2 wc = vec2(-1.4, -1.6);
    vec2 d = p - wc;
    float r = length(d);
    float a = atan(d.y, d.x);
    float turn = 0.02 * sceneTime + 0.15 * audioAdvance;
    // Shear: the liquid layers turn at slightly different speeds with radius.
    float stretch = 1.0 + 2.0 * clamp(audioSpread, 0.0, 1.0);
    vec2 w = vec2((a - turn * (1.0 + 0.3 * sin(r * 2.0))) * r * 2.0 / stretch, r * 2.0);
    // Dye pools: warped fbm in the rotating frame.
    vec2 q = w * 1.2;
    vec2 wa = vec2(fbm3(q), fbm3(q + 4.0));
    float dye = fbm(q * (1.0 + rough) + wa * 1.5);
    float dye2 = fbm(q * 1.3 + wa * 2.0 + 7.0);
    vec2 uv = w * 0.2 + 0.5;
    vec3 c1 = imgPalette(fract(dye * 0.7 + hueP * 0.159));
    vec3 c2 = imgPalette(fract(dye2 * 0.7 + 0.4 + hueP * 0.159));
    c1 = c1 / max(max(c1.r, max(c1.g, c1.b)), 0.2);
    c2 = c2 / max(max(c2.r, max(c2.g, c2.b)), 0.2);
    vec3 ph = glowColour(imgLod(uv, 3.0), w, hueP * 0.159);
    c1 = mix(c1, ph, 0.4 * clamp(photoP, 0.0, 1.0));
    float sat = 0.8 + 0.8 * clamp(dyeP, 0.0, 1.0);
    c1 = max(mix(vec3(luma(c1)), c1, sat), 0.0);
    c2 = max(mix(vec3(luma(c2)), c2, sat), 0.0);
    c1 *= mix(vec3(0.8, 0.9, 1.2), vec3(1.2, 0.9, 0.75), mode);
    c2 *= mix(vec3(0.8, 0.9, 1.2), vec3(1.2, 0.9, 0.75), mode);
    vec3 lamp = vec3(1.0, 0.97, 0.9) * (0.8 + 0.5 * bass);
    // Beer-Lambert mixing of the two dyes by their densities.
    float dens1 = smoothstep(0.4, 0.7, dye), dens2 = smoothstep(0.45, 0.75, dye2);
    vec3 col = lamp * mix(vec3(1.0), c1, dens1) * mix(vec3(1.0), c2, dens2 * 0.8);
    // Lens bubbles of clear oil: metaballs stretched along the flow, bright rims.
    float S = 2.0 + 2.0 * clamp(bubbleP, 0.0, 1.0);
    vec2 g = w * S;
    vec2 gi = floor(g);
    float F = 0.0; vec2 G = vec2(0.0);
    for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
        vec2 id = gi + vec2(i, j);
        if (hash21(id) > 0.5) continue;
        vec2 c = id + 0.5 + 0.3 * (hash22(id + 1.0) - 0.5);
        float R = (0.25 + 0.15 * hash21(id + 2.0)) * (0.8 + 0.4 * swell);
        vec2 dd = g - c;
        float m = exp(-dot(dd, dd) / (R * R));
        F += m; G += m * dd / (R * R);
    }
    float fwF = fwidth(F) + 1e-3;
    float lens = smoothstep(0.5 - fwF, 0.5 + fwF, F);
    // Inside a lens: the dyes behind seen magnified (a different part of the
    // flow) and brighter; a soft darker rim where the light bends away.
    vec2 mag = -G * 0.03;
    float dyeIn = fbm(q * 0.6 + mag * 6.0 + 3.0);
    vec3 inside = lamp * mix(vec3(1.0), mix(c2, c1, smoothstep(0.35, 0.65, dyeIn)), 0.8) * 1.05;
    float rim = smoothstep(0.5, 0.58, F) * (1.0 - smoothstep(0.58, 0.9, F));
    col = mix(col, inside, lens);
    col *= 1.0 - 0.35 * rim;
    finish(col);
}
