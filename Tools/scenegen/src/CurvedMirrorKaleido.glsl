//@doc
 * @brief CURVED MIRROR KALEIDO: a kaleidoscope whose mirrors are not flat --
 * the photo is folded through a ring of wedge mirrors whose surfaces bow
 * and breathe, so the seams curve like petals, the reflections swell and
 * pinch toward the rim, and the rosette opens and closes like a flower.
 * Each fold also nests a smaller, turned rosette inside (a second
 * kaleidoscope stage), so the pattern has depth.  The fold continues
 * endlessly outward and mirrors without seams, like the original
 * Kaleidoscope.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the rosette turns (integrated, jump-free)
 *   audioAdvance    -> the window drifts through the photo (integrated)
 *   audioMode       -> mirror curvature: straight petals in minor, full bowed petals in major
 *   audioHarmChange -> the rosette breathes open on chord changes (slow release)
 *   audioRoughness  -> the mirror glass ripples
 *   audioSpread     -> the inner stage's scale
 *   audioHigh       -> the mirror seams glint (light)
 *
 * Knobs: sidesP (number of mirrors), bowP (base curvature), innerP (inner
 * stage strength), hueP.
//@params sidesP bowP innerP
//@audio audioPhase audioMode audioHarmChange audioRoughness audioSpread audioHigh
//@body
vec2 fold(vec2 p, float n, float bow, float rough, out float seam)
{
    float r = length(p);
    float a = atan(p.y, p.x);
    float sec = 3.14159265 / n;
    // Curved mirrors: the seam angle bends with the radius.
    a += bow * sin(r * 2.2) + 0.03 * rough * sin(r * 14.0 + sceneTime);
    float fa = mod(a, 2.0 * sec);
    fa = abs(fa - sec);
    seam = min(fa, sec - fa) * r;
    return vec2(cos(fa), sin(fa)) * r;
}

void main()
{
    vec2 p = screenP() * 2.2;
    float rough = clamp(audioRoughness, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float n = 3.0 + floor(clamp(sidesP, 0.0, 1.0) * 5.99);
    float bow = (0.15 + 0.35 * clamp(bowP, 0.0, 1.0)) * (0.3 + 0.7 * clamp(audioMode, 0.0, 1.0));
    float breath = 1.0 + 0.12 * clamp(audioHarmChange, 0.0, 1.0);
    p = rot2(0.02 * sceneTime + 0.3 * audioPhase) * p / breath;

    float seam1;
    vec2 f1 = fold(p, n, bow, rough, seam1);
    // Second stage: a smaller rosette nested inside the first fold.
    float s2 = 1.6 + 1.2 * clamp(audioSpread, 0.0, 1.0);
    vec2 c2 = vec2(1.1, 0.0);
    float seam2;
    vec2 f2 = fold(rot2(-0.05 * sceneTime) * (f1 - c2) * s2, n + 1.0, -bow, rough, seam2);
    float inner = clamp(innerP, 0.0, 1.0);
    vec2 win = vec2(0.5) + 0.3 * vec2(sin(0.011 * sceneTime + 0.2 * audioAdvance), cos(0.009 * sceneTime + 0.17 * audioAdvance));
    vec3 a1 = imgLod(win + f1 * 0.4, 0.0);
    vec3 a2 = imgLod(win + vec2(0.13, 0.07) + f2 * 0.25, 0.0);
    float w2 = inner * smoothstep(1.3, 0.6, length(f1 - c2) * s2 / 2.0);
    vec3 col = mix(a1, a2, w2);
    // Colour: the photo's hue, or the wandering hue field where it is grey.
    vec3 hueF = hsv2rgb(vec3(fract(hueP * 0.159 + 0.18 * length(f1) + 0.03 * audioAdvance), 0.7, 1.0));
    col *= mix(vec3(1.0), mix(glowColour(imgLod(win, 5.0), f1 * 0.5, hueP * 0.159), hueF, 0.5) * 1.4, 0.4);
    // Seams glint like mirror edges.
    float px = 2.2 / resolution.y;
    float sg = exp(-seam1 / (px * 2.0)) + w2 * exp(-seam2 / (px * 2.0 * s2));
    col += vec3(1.0, 0.97, 0.92) * sg * (0.05 + 0.25 * hi);
    // Contrast and saturation around the photo's own mean, like a lit kaleidoscope.
    float m = luma(imgLod(win, 8.0));
    col = (col - m) * 1.6 + m;
    col = mix(vec3(luma(col)), col, 1.4) * 1.1;
    finish(col);
}
