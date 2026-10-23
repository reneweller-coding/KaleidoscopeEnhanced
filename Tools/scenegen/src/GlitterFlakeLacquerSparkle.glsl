//@doc
 * @brief GLITTER FLAKE LACQUER SPARKLE: glitter lacquer: thousands of flakes at random tilts whose sparkle changes with the direction of the light; the photo colours the flakes, and the light source wanders softly so that every flake fades in and out softly.  The flakes are small round plates on a jittered net, each with its
 * own normal; the highlight of a flake is a high power of the reflection, so only flakes near the mirror direction glint.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread  -> the size of the flakes (smoothed)
 *   audioAdvance -> the light wanders (integrated)
 *
 * Knobs: sizeP (the flake density), hueP.
//@params sizeP
//@audio audioSpread audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float S = (0.012 + 0.012 * (1.0 - clamp(sizeP, 0.0, 1.0))) * (1.0 + 0.4 * clamp(audioSpread, 0.0, 1.0));
    vec2 g = p / S;
    vec2 gi = floor(g);
    float la = 0.02 * audioAdvance + 0.045 * sceneTime;
    vec3 L = normalize(vec3(0.8 * cos(la), 0.8 * sin(0.8 * la + 1.0), 0.6));
    vec3 V = vec3(0.0, 0.0, 1.0);
    vec3 H = normalize(L + V);
    vec3 col = imgLod(p * 0.85 + 0.5, 1.5) * 0.12 + vec3(0.01, 0.012, 0.02);
    for (int dy = -1; dy <= 1; ++dy)
        for (int dx = -1; dx <= 1; ++dx) {
            vec2 cj = gi + vec2(float(dx), float(dy));
            vec2 h = hash22(cj);
            vec2 pt = cj + 0.5 + 0.4 * (h - 0.5) * 2.0;
            float d = length(g - pt);
            float R = 0.38 + 0.12 * h.x;
            if (d > R) continue;
            vec2 nxy = (hash22(cj + 17.0) - 0.5) * 0.9;
            vec3 N = normalize(vec3(nxy, 1.0));
            float spec = pow(max(dot(N, H), 0.0), 140.0);
            vec3 c = imgLod(pt * S * 0.85 + 0.5, 1.2);
            c = mix(vec3(luma(c)), c, 1.5);
            float disc = 1.0 - smoothstep(R * 0.8, R, d);
            col += (c * 0.35 + c * 2.6 * spec + vec3(1.0) * spec * 0.8) * disc;
        }
    finish(col * 1.05);
}
