//@doc
 * @brief INK IN OIL DROPLET: drops of coloured water suspended in clear oil
 * -- round and oval droplets of every size float in a golden oil,
 * drifting slowly, wobbling, and when two meet they merge into one with a
 * little shiver; inside each drop the colour swirls (from the photograph)
 * and a bright rim and highlight show its lens; small satellite droplets
 * trail around the big ones.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the drift (integrated, jump-free)
 *   audioSpread     -> drop size
 *   audioKick       -> the rims flash (light)
 *   audioMode       -> the oil: pale gold in minor, deep amber in major
 *   audioRoughness  -> the drops wobble
 *   audioSwell      -> the swirl inside the drops (slow)
 *
 * Knobs: dropP (drop density), swirlP (inner swirl), photoP (photo colours), hueP.
//@params dropP swirlP photoP
//@audio audioSpread audioKick audioMode audioRoughness audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    float T = 0.05 * sceneTime + 0.35 * audioAdvance;
    vec3 oil = mix(vec3(0.75, 0.65, 0.3), vec3(0.55, 0.3, 0.08), mode);
    vec2 uv = p * 0.5 + 0.5;
    vec3 col = oil * (0.55 + 0.25 * fbm3(p * 2.0 + T)) + imgLod(uv, 4.0) * 0.08;
    // Metaball drops (merging) on a drifting jittered grid, two sizes.
    float S = 2.2 + 1.8 * clamp(dropP, 0.0, 1.0);
    float F = 0.0; vec3 C = vec3(0.0); vec2 G = vec2(0.0);
    for (int L = 0; L < 2; ++L) {
        float fl = float(L);
        float Sl = S * (1.0 + 2.0 * fl);
        vec2 g = p * Sl + vec2(T * (0.6 + 0.4 * fl), 0.3 * T) + fl * 11.0;
        vec2 gi = floor(g);
        for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
            vec2 id = gi + vec2(i, j);
            float h = hash21(id + fl * 7.0);
            if (fl > 0.5 && h > 0.5) continue;
            vec2 c = id + 0.5 + 0.35 * vec2(sin(T * (1.0 + h) + h * 6.28), cos(T * (0.8 + h) + h * 9.0));
            float R = (0.25 + 0.12 * clamp(audioSpread, 0.0, 1.0)) * (0.6 + 0.5 * h) * (1.0 - 0.4 * fl);
            vec2 d = (g - c) / Sl;                              // screen units
            float wob = 1.0 + (0.04 + 0.12 * rough) * sin(atan(d.y, d.x) * 3.0 + sceneTime * (1.0 + h) + h * 6.0);
            float rr = R / Sl * wob;
            float m = exp(-dot(d, d) / (rr * rr) * 1.2);
            F += m;
            G += m * d / (rr * rr);
            vec3 pc = glowColour(imgLod(hash22(id + fl * 5.0), 3.0), id, hueP * 0.159 + h * 0.5);
            pc = mix(mix(vec3(0.2, 0.5, 0.9), vec3(0.9, 0.25, 0.4), h), pc, clamp(photoP, 0.0, 1.0) * 0.8);
            C += pc * m;
        }
    }
    vec3 dc = C / max(F, 1e-4);
    float fwF = fwidth(F) + 1e-3;
    float inside = smoothstep(0.5 - fwF, 0.5 + fwF, F);
    // Inner swirl.
    float sw = fbm3(p * 8.0 + (0.5 + clamp(swirlP, 0.0, 1.0)) * vec2(fbm3(p * 4.0 + T * 2.0), fbm3(p * 4.0 - T * 2.0 + 3.0)) * 2.0);
    vec3 drop = dc * (0.6 + 0.6 * sw * (0.5 + swell));
    // Lens: the oil behind seen through, a rim and a highlight.
    vec3 n = normalize(vec3(-G * 0.02, 1.0));
    float rim = smoothstep(0.5, 0.65, F) * (1.0 - smoothstep(0.65, 1.2, F));
    drop *= 0.7 + 0.5 * n.z;
    drop += vec3(1.0) * rim * 0.15;
    float spec = pow(max(dot(n, normalize(vec3(-0.4, 0.5, 0.8))), 0.0), 40.0);
    drop += vec3(1.0, 0.98, 0.95) * spec * (0.4 + 1.0 * kick);
    col = mix(col, drop, inside);
    col *= 1.0 - 0.3 * smoothstep(0.25, 0.5, F) * (1.0 - inside);   // a faint shadow ring around each drop
    finish(col);
}
