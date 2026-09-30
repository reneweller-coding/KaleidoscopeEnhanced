//@doc
 * @brief TEXTURE CELTIC KNOTWORK: an endless Celtic knot -- broad ribbons
 * weave diagonally over and under each other, turning at the borders of
 * a grid of cells so they form one continuous interlace, each ribbon cut
 * from the photograph and outlined in dark ink, shaded where it dips
 * under its crossing partner; light pulses travel along the ribbons, and
 * the knot pattern slowly re-routes as crossing points open and close.
 * Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the pulses travel along the ribbons (integrated)
 *   audioSpread     -> ribbon width
 *   audioKick       -> the pulses flare (light)
 *   audioMode       -> the ink: black in minor, gold in major
 *   audioHarmChange -> the knot re-routes (slow, smoothed)
 *   audioSwell      -> the ground between ribbons glows (slow)
 *
 * Knobs: cellP (knot scale), breakP (open crossings), photoP (photo on the ribbons), hueP.
//@params cellP breakP photoP
//@audio audioSpread audioKick audioMode audioHarmChange audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float S = 4.0 + 5.0 * (1.0 - clamp(cellP, 0.0, 1.0));
    vec2 q = p * S;
    // Two diagonal ribbon families on a rotated grid.
    vec2 d = vec2(q.x + q.y, q.x - q.y) * 0.70710678;
    vec2 fd = fract(d) - 0.5;
    vec2 id = floor(d);
    float w = 0.16 + 0.1 * clamp(audioSpread, 0.0, 1.0);
    float px = fwidth(d.x) * 1.2 + 1e-4;
    float r1 = abs(fd.x), r2 = abs(fd.y);
    float onA = smoothstep(w + px, w - px, r1);                 // ribbon family A (along d.y)
    float onB = smoothstep(w + px, w - px, r2);                 // ribbon family B (along d.x)
    // Over/under alternates at each crossing.
    vec2 cc = floor(d + 0.5);
    float over = mod(cc.x + cc.y, 2.0);
    // Some crossings open into turns (breaks), slowly changing.
    float br = 0.15 + 0.35 * clamp(breakP, 0.0, 1.0);
    float change = 0.02 * sceneTime + 0.3 * clamp(audioHarmChange, 0.0, 1.0);
    float isBreak = smoothstep(br + 0.05, br - 0.05, noise2(cc * 0.7 + change));
    // At a break, cut the ribbons near the crossing and round them into turns (approx.).
    vec2 cr = d - cc;
    float nearX = smoothstep(0.35, 0.2, max(abs(cr.x), abs(cr.y)));
    float turnR = abs(length(abs(cr) - vec2(0.5)) - 0.5);
    float turn = smoothstep(w + px, w - px, turnR) * nearX * isBreak;
    onA *= 1.0 - nearX * isBreak;
    onB *= 1.0 - nearX * isBreak;
    // Photo along the ribbons.
    vec3 phA = imgLod(vec2(d.y * 0.1, fd.x * 0.3) + 0.5 + id.x * 0.13, 1.0);
    vec3 phB = imgLod(vec2(d.x * 0.1, fd.y * 0.3) + 0.2 + id.y * 0.17, 1.0);
    vec3 gc = glowColour(imgLod(p * 0.5 + 0.5, 5.0), p, hueP * 0.159);
    vec3 ribA = mix(gc * 0.9, phA * 1.2, clamp(photoP, 0.0, 1.0));
    vec3 ribB = mix(gc.gbr * 0.9, phB * 1.2, clamp(photoP, 0.0, 1.0));
    // Pulses travelling along.
    float T = 0.5 * sceneTime + 3.0 * audioAdvance;
    float pa = pow(0.5 + 0.5 * sin(d.y * 2.0 - T + id.x), 10.0);
    float pb = pow(0.5 + 0.5 * sin(d.x * 2.0 + T + id.y), 10.0);
    ribA += gc * pa * (0.4 + 1.5 * kick);
    ribB += gc * pb * (0.4 + 1.5 * kick);
    // Shade: the under ribbon darkens near the crossing.
    float underShade = 1.0 - 0.45 * smoothstep(w * 2.5, w, min(r1, r2));
    vec3 inkC = mix(vec3(0.02), vec3(0.9, 0.7, 0.3), mode);
    vec3 col = mix(vec3(0.02, 0.02, 0.03), gc * 0.15, 0.3 + 0.7 * swell);
    vec3 first = over > 0.5 ? ribB * underShade : ribA * underShade;
    vec3 second = over > 0.5 ? ribA : ribB;
    float fOn = over > 0.5 ? onB : onA, sOn = over > 0.5 ? onA : onB;
    // Ink outlines.
    float outA = smoothstep(w + px * 2.5, w + px * 0.5, r1) * (1.0 - smoothstep(w - px * 0.5, w - px * 2.5, r1));
    float outB = smoothstep(w + px * 2.5, w + px * 0.5, r2) * (1.0 - smoothstep(w - px * 0.5, w - px * 2.5, r2));
    col = mix(col, first, fOn);
    col = mix(col, inkC, (over > 0.5 ? outB : outA) * (1.0 - nearX * isBreak));
    col = mix(col, second, sOn);
    col = mix(col, inkC, (over > 0.5 ? outA : outB) * (1.0 - nearX * isBreak) * (1.0 - fOn * (1.0 - sOn)));
    col = mix(col, mix(ribA, ribB, 0.5), turn);
    finish(col);
}
