//@doc
 * @brief VAULT SHAFT UP: lying on the floor of an endless tower and looking
 * straight up -- storey after storey of arcades and galleries recede into
 * the height around the square shaft, each level ringed by arches whose
 * openings show the photograph like stained glass lit from outside, the
 * stone ribs converging toward the bright sky at the top; we rise slowly
 * through the levels and the tower turns.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the rise (integrated, jump-free)
 *   audioPhase      -> the tower turns (integrated)
 *   audioSpread     -> the arches grow taller
 *   audioKick       -> the windows flare (light)
 *   audioMode       -> the light: cool in minor, golden in major
 *   audioSwell      -> the sky glow at the top (slow)
 *
 * Knobs: archP (arches per wall), storeyP (storey height), glassP (window brightness), hueP.
//@params archP storeyP glassP
//@audio audioPhase audioSpread audioKick audioMode audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    vec2 r2 = rot2(0.015 * sceneTime + 0.15 * audioPhase) * p;
    // Square shaft: the wall we see and the coordinate along it.
    float m = max(abs(r2.x), abs(r2.y));
    float z = 0.5 / max(m, 1e-4);                               // height up the shaft
    float per;
    if (abs(r2.x) > abs(r2.y)) per = r2.x > 0.0 ? 1.0 + r2.y / abs(r2.x) : 5.0 - r2.y / abs(r2.x);
    else                       per = r2.y > 0.0 ? 3.0 - r2.x / abs(r2.y) : 7.0 + r2.x / abs(r2.y);
    per = mod(per + 1.0, 8.0);
    // Footprint of per without the spikes at the wrap (8 -> 0) and the wall corners.
    float fwP = min(fwidth(per), fwidth(mod(per + 4.0, 8.0)));
    float fwH;
    float wall = floor(per * 0.5);
    float s = per - 2.0 * wall - 1.0;                           // -1..1 across the wall
    float rise = 0.3 * sceneTime + 2.0 * audioAdvance;
    float sh = 1.0 + 1.0 * clamp(storeyP, 0.0, 1.0);          // storey height
    float h = (z + rise) / sh;
    float storey = floor(h);
    float fh = fract(h);                                        // 0 floor .. 1 ceiling of the storey
    fwH = fwidth(h);
    float nA = floor(2.0 + 3.0 * clamp(archP, 0.0, 1.0));      // arches per wall
    float ax = (s * 0.5 + 0.5) * nA;
    float ai = floor(ax);
    float af = fract(ax) - 0.5;                                  // -0.5..0.5 across the arch
    // Arch opening: a rectangle with a round top.
    float archH = 0.55 + 0.2 * clamp(audioSpread, 0.0, 1.0);
    float ow = 0.34;
    vec2 aq = vec2(af, fh - 0.1);
    float body = max(abs(aq.x) - ow, max(-aq.y, aq.y - archH + ow));
    float top = length(vec2(aq.x, aq.y - (archH - ow))) - ow;
    float opening = min(body, max(top, -(aq.y - (archH - ow))));
    float px = (fwP * 0.5 * nA + fwH) * 1.2 + 1e-4;
    float inOpen = smoothstep(px, -px, opening);
    vec3 lc = mix(vec3(0.7, 0.8, 1.0), vec3(1.15, 0.9, 0.6), mode);
    // Stone: the photo, grey and dim, lit from above.
    vec2 suv = vec2(per * 0.5, h * 0.3);
    vec3 stone = mix(vec3(luma(imgLod(suv, 2.0))), imgLod(suv, 2.0), 0.3) * 0.5 * lc;
    stone *= 0.6 + 0.4 * fh;                                    // lighter toward the top of each storey
    // Ribs: the corner lines and the cornice at each floor.
    float corner = exp(-(1.0 - abs(s)) / (fwP * 2.0 + 1e-4));
    float cornice = exp(-min(fh, 1.0 - fh) / (fwH * 2.0 + 1e-4));
    stone += lc * (corner + cornice) * 0.15;
    // Stained glass in the openings: the photo, glowing.
    vec2 guv = vec2(af * 0.8 + ai * 0.31 + wall * 0.17, aq.y * 0.8 + storey * 0.23);
    vec3 glass = imgLod(guv, 0.8);
    glass = mix(glass, glowColour(glass, vec2(ai, storey), hueP * 0.159), 0.35) * (0.6 + 0.9 * clamp(glassP, 0.0, 1.0)) * (1.0 + 1.2 * kick);
    // Leading between the panes.
    float lead = step(0.94, max(abs(fract(guv.x * 4.0) - 0.5), abs(fract(guv.y * 4.0) - 0.5)) * 2.0);
    glass *= 1.0 - 0.7 * lead;
    vec3 col = mix(stone, glass, inOpen);
    // Height fog to the bright sky above.
    vec3 sky = mix(lc, glowColour(imgLod(vec2(0.5), 6.0), p, hueP * 0.159), 0.3) * (0.6 + 0.8 * swell);
    col = mix(sky, col, exp(-z * 0.06));
    col += sky * exp(-length(p) * 10.0) * 0.8;
    finish(col);
}
