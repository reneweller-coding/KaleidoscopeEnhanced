//@doc
 * @brief TEXTURE WEAVE SYMMETRY: a kaleidoscope woven from ribbons -- the
 * photograph is folded into a square mirror symmetry (p4m), and the
 * folded image is then cut into ribbons that weave over and under each
 * other in a basket weave, each ribbon shaded round and dipping at the
 * crossings; the weave slowly slides along its ribbons and the fold
 * window drifts through the picture.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the ribbons slide and the window drifts (integrated, jump-free)
 *   audioSpread     -> ribbon width (gaps between ribbons)
 *   audioKick       -> the ribbon crowns flash (light)
 *   audioMode       -> warp and weft tinted apart (cool vs. warm)
 *   audioPhase      -> the weave turns (integrated)
 *   audioSwell      -> the gap glow (slow)
 *
 * Knobs: ribbonP (ribbon count), foldP (fold cell size), photoZoomP, hueP.
//@params ribbonP foldP photoZoomP
//@audio audioSpread audioKick audioMode audioPhase audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    vec2 q = rot2(0.01 * sceneTime + 0.1 * audioPhase + 0.785) * p;
    float T = 0.04 * sceneTime + 0.3 * audioAdvance;
    // p4m fold of the photo.
    float fc = 0.3 + 0.3 * clamp(foldP, 0.0, 1.0);
    vec2 fq = abs(fract(q / fc + 0.5) - 0.5) * 2.0;             // 0..1, mirrored
    if (fq.y > fq.x) fq = fq.yx;                                // diagonal mirror
    float z = 0.3 + 0.4 * clamp(photoZoomP, 0.0, 1.0);
    vec2 win = vec2(0.5) + 0.25 * vec2(sin(T * 0.7), cos(T * 0.5));
    vec3 photo = imgLod(win + fq * z, 0.5);
    // Basket weave.
    float N = 5.0 + 8.0 * clamp(ribbonP, 0.0, 1.0);
    vec2 g = q * N + vec2(T * 2.0, 0.0);
    vec2 gi = floor(g), f = fract(g) - 0.5;
    float over = mod(gi.x + gi.y, 2.0);                         // warp over weft on a checker
    float gap = 0.04 + 0.2 * (1.0 - clamp(audioSpread, 0.0, 1.0));
    float px = fwidth(g.x) * 1.2;
    float warp = smoothstep(0.5 - gap + px, 0.5 - gap - px, abs(f.x));
    float weft = smoothstep(0.5 - gap + px, 0.5 - gap - px, abs(f.y));
    float profW = sqrt(max(0.0, 1.0 - pow(abs(f.x) / (0.5 - gap), 2.0)));
    float profF = sqrt(max(0.0, 1.0 - pow(abs(f.y) / (0.5 - gap), 2.0)));
    float dipW = 0.65 + 0.35 * sqrt(max(0.0, 1.0 - 4.0 * f.y * f.y));
    float dipF = 0.65 + 0.35 * sqrt(max(0.0, 1.0 - 4.0 * f.x * f.x));
    vec3 tW = mix(vec3(1.0), mix(vec3(0.8, 0.9, 1.1), vec3(1.1, 0.9, 0.75), mode), 0.5);
    vec3 tF = mix(vec3(1.0), mix(vec3(1.1, 0.9, 0.75), vec3(0.8, 0.9, 1.1), mode), 0.5);
    vec3 cW = photo * tW * (0.45 + 0.65 * profW) * (over > 0.5 ? 1.0 : dipW);
    vec3 cF = photo * tF * (0.45 + 0.65 * profF) * (over > 0.5 ? dipF : 1.0);
    cW += vec3(1.0) * pow(profW, 10.0) * (0.05 + 0.4 * kick);
    cF += vec3(1.0) * pow(profF, 10.0) * (0.05 + 0.4 * kick);
    vec3 gapC = glowColour(photo, q, hueP * 0.159) * (0.03 + 0.2 * swell);
    vec3 col = gapC;
    vec3 top = over > 0.5 ? cW : cF, bot = over > 0.5 ? cF * 0.7 : cW * 0.7;
    float topA = over > 0.5 ? warp : weft, botA = over > 0.5 ? weft : warp;
    col = mix(col, bot, botA);
    col = mix(col, top, topA);
    finish(col);
}
