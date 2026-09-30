//@doc
 * @brief TEXTURE GOLD LEAF BURNISH: a surface gilded with gold leaf -- square
 * leaves laid slightly overlapping, each with its own faint crinkles and
 * a slightly different tilt, so a moving light makes them flash one after
 * another, burnished parts mirror-bright, the photograph showing through
 * where the leaf has cracked and worn away (like an old icon); the light
 * sweeps slowly across.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the light sweeps (integrated, jump-free)
 *   audioSpread     -> how much of the leaf is worn away
 *   audioKick       -> the flashes (light)
 *   audioMode       -> leaf: white gold/silver in minor, yellow gold in major
 *   audioRoughness  -> the crinkles
 *   audioSwell      -> the photo beneath glows (slow)
 *
 * Knobs: leafP (leaf size), crackP (craquelure), photoP (photo visibility), hueP.
//@params leafP crackP photoP
//@audio audioSpread audioKick audioMode audioRoughness audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    vec2 uv = p * 0.5 + 0.5;
    vec3 ph = imgK(uv, 1.0);
    float S = 3.0 + 4.0 * (1.0 - clamp(leafP, 0.0, 1.0));
    // Leaves laid in rows, each row offset (brick-like), slightly overlapping.
    vec2 g = p * S;
    float row = floor(g.y);
    g.x += 0.5 * mod(row, 2.0) + 0.07 * sin(row * 3.1);
    vec2 li = floor(g);
    vec2 lf = fract(g);
    float h = hash21(li);
    // Each leaf's tilt; crinkles on top.
    vec2 tilt = (hash22(li + 3.0) - 0.5) * 0.25;
    float cr = fbm3(lf * 4.0 + li * 7.0) - 0.5;
    // Crinkles: smooth, folded (sharp creases from |noise|), no value-noise blocks.
    vec2 crink = vec2(abs(fbm3(lf * 3.0 + li * 5.0) - 0.5), abs(fbm3(lf * 3.0 + li * 5.0 + 9.0) - 0.5)) * (0.2 + 0.5 * rough) - 0.06;
    vec3 n = normalize(vec3(tilt + crink + cr * 0.1, 1.0));
    // A light sweeping across.
    float T = 0.1 * sceneTime + 0.7 * audioAdvance;
    vec3 L = normalize(vec3(cos(T), sin(T * 0.7) * 0.6, 0.8));
    vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
    float spec = pow(max(dot(n, H), 0.0), 30.0);
    float diff = max(dot(n, L), 0.0);
    vec3 gold = mix(vec3(0.85, 0.85, 0.82), vec3(1.0, 0.78, 0.35), mode);
    vec3 leaf = gold * (0.25 + 0.4 * diff) + mix(gold, vec3(1.0), 0.4) * spec * (1.2 + 2.0 * kick);
    // Overlap seams: a slightly darker edge where leaves overlap.
    float seam = smoothstep(0.03, 0.0, min(lf.x, lf.y));
    leaf *= 1.0 - 0.3 * seam;
    // Wear: where the leaf is gone the photo (the bole underneath) shows.
    float wear = smoothstep(0.62 - 0.25 * clamp(audioSpread, 0.0, 1.0), 0.75, fbm(p * 3.0 + 11.0) + 0.3 * (luma(ph) - 0.5));
    float crackl = exp(-abs(fbm3(p * 25.0) - 0.5) / 0.015) * clamp(crackP, 0.0, 1.0);
    vec3 bole = mix(vec3(0.45, 0.15, 0.08), ph, clamp(photoP + 0.3, 0.0, 1.0)) * (0.6 + 0.6 * swell);
    vec3 col = mix(leaf, bole, clamp(wear + crackl * 0.7, 0.0, 1.0));
    col = mix(col, col * glowColour(ph, p, hueP * 0.159) * 1.2, 0.05);
    finish(col);
}
