//@doc
 * @brief TEXTURE PETAL FOLD: origami blossoms opening and closing -- a field
 * of paper flowers, each folded from a square of the photograph into
 * pleated petals that radiate from the centre, their valley and mountain
 * folds shaded by a soft light; the blossoms slowly open (petals flatten)
 * and close (petals rise and narrow) in waves across the field.
 * Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the opening waves travel (integrated, jump-free)
 *   audioSpread     -> how far the blossoms open
 *   audioKick       -> the fold ridges catch light (light)
 *   audioMode       -> the light: cool in minor, warm in major
 *   audioPhase      -> the blossoms turn (integrated)
 *   audioSwell      -> the shadows deepen (slow)
 *
 * Knobs: petalP (petal count), sizeP (blossom size), paperP (paper grain), hueP.
//@params petalP sizeP paperP
//@audio audioSpread audioKick audioMode audioPhase audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float S = 2.0 + 2.5 * (1.0 - clamp(sizeP, 0.0, 1.0));
    vec2 g = p * S;
    const vec2 s = vec2(1.0, 1.7320508);
    vec2 a = mod(g, s) - s * 0.5;
    vec2 b = mod(g - s * 0.5, s) - s * 0.5;
    vec2 l = dot(a, a) < dot(b, b) ? a : b;
    vec2 cid = g - l;
    cid = floor(cid / (s * 0.5) + 0.5) * (s * 0.5);                // exact centre: hashes must not see rounding noise
    float h = hash21(cid);
    float T = 0.2 * sceneTime + 1.2 * audioAdvance;
    float open = 0.35 + 0.35 * clamp(audioSpread, 0.0, 1.0) + 0.3 * sin(T - dot(cid, vec2(0.5, 0.3)));
    float n = 2.0 * floor(3.0 + 3.0 * clamp(petalP, 0.0, 1.0));
    float rot = 0.1 * sceneTime * (h - 0.5) + 0.3 * audioPhase + h * 6.28;
    vec2 q = rot2(rot) * l;
    float r = length(q);
    float ang = atan(q.y, q.x);
    float sec = 6.2831853 / n;
    float fa = mod(ang + 6.2831853, sec) - sec * 0.5;          // -half..half within the petal
    // Petal outline: pointed, narrower when closed.
    float R = 0.48 * (0.75 + 0.25 * open);
    float widthF = 0.45 + 0.55 * open;
    float edgeA = abs(fa) / (sec * 0.5 * widthF);
    float outline = r / R + 0.35 * edgeA * edgeA * (r / R);
    float px = fwidth(g.x) * 1.5 / R;
    float inside = smoothstep(1.0 + px, 1.0 - px, outline);
    // Pleats: each petal has a mountain fold on its midline and valley folds at its sides.
    float slope = (1.0 - open) * 1.2;
    float nx = sign(fa) * slope;                                 // the two halves tilt opposite
    vec3 nrm = normalize(vec3(rot2(ang) * vec2(-0.3 * (1.0 - open), nx), 1.0));
    vec3 L = normalize(vec3(-0.5, 0.6, 0.7));
    float diff = 0.35 + 0.65 * max(dot(nrm, L), 0.0);
    vec2 uv = cid / S * 0.6 + 0.5 + q * 0.25;
    vec3 ph = imgLod(uv, 0.8);
    vec3 lc = mix(vec3(0.85, 0.92, 1.1), vec3(1.1, 0.95, 0.8), mode);
    vec3 paper = ph * lc * diff * (1.0 - 0.07 * clamp(paperP, 0.0, 1.0) * noise2(q * 40.0 * S));   // grain at a fixed screen scale
    float ridge = exp(-abs(fa) * r / (px * R * 0.5 + 0.004));
    paper += lc * ridge * (0.05 + 0.4 * kick) * (1.0 - open);
    // Shadow under the petals onto the ground.
    vec3 ground = imgLod(p * 0.5 + 0.5, 4.0) * 0.08;
    float sh = smoothstep(1.2, 0.9, outline) * (0.4 + 0.4 * swell) * (1.0 - open * 0.5);
    vec3 col = ground * (1.0 - sh);
    col = mix(col, paper, inside);
    col = mix(col, col * glowColour(ph, cid, hueP * 0.159) * 1.3, 0.08);
    // The centre.
    col = mix(col, lc * 0.9 * glowColour(ph, cid, hueP * 0.159), smoothstep(0.06, 0.03, r) * inside);
    finish(col);
}
