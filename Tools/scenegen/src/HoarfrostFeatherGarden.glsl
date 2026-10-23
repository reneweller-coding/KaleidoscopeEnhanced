//@doc
 * @brief HOARFROST FEATHER GARDEN: hoarfrost: feather-shaped ice crystals that grow on twigs and surfaces, each branching; the photo lies under the frost, and the frost grows against the wind.  A lattice of stems, each tilted; side branches leave every stem at a slant on both sides, with finer branches on those; the
 * stems grow to a length that breathes, and the frost is white with a faint tint of the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the growth: how long the stems are
 *   audioSpread  -> the number of side branches (smoothed)
 *
 * Knobs: sizeP (the size of the crystals), hueP.
//@params sizeP
//@audio audioSwell audioSpread
//@body
void main()
{
    vec2 p = screenP();
    float S = 0.22 + 0.16 * clamp(sizeP, 0.0, 1.0);
    vec2 g = p / S;
    vec2 gi = floor(g);
    vec2 f = fract(g) - 0.5;
    vec3 base = imgLod(p * 0.85 + 0.5, 0.6);
    vec3 col = base * 0.8;
    float frost = 0.0;
    float L = (0.55 + 0.35 * clamp(audioSwell, 0.0, 1.0)) * (0.8 + 0.2 * sin(0.1 * sceneTime));
    float pitch = 0.11 - 0.04 * clamp(audioSpread, 0.0, 1.0);
    for (int dy = -1; dy <= 1; ++dy)
        for (int dx = -1; dx <= 1; ++dx) {
            vec2 cj = gi + vec2(float(dx), float(dy));
            vec2 h = hash22(cj);
            float ang = 1.2 + 0.8 * (h.x - 0.5) + 0.0;
            vec2 ax = vec2(cos(ang), sin(ang));
            vec2 nx = vec2(-ax.y, ax.x);
            vec2 q = (g - cj - 0.5 - (h - 0.5) * 0.3);
            float a = dot(q, ax) + 0.45;
            float b = dot(q, nx);
            float stem = 1.0 - smoothstep(0.0, 0.02, abs(b));
            float on = step(0.0, a) * step(a, L * 0.9);
            float k = a / pitch;
            float fk = fract(k);
            float br = abs(abs(b) - fk * pitch * 1.6 * (1.0 - a / (L * 0.95)) * 2.2);
            float side = (1.0 - smoothstep(0.0, 0.022, br)) * step(0.0, abs(b)) * step(abs(b), 0.3 * (1.0 - a / L)) * on;
            float fine = (1.0 - smoothstep(0.0, 0.008, abs(fract(abs(b) / 0.03 + 0.5 * k) - 0.5) * 0.03)) * 0.0;
            frost = max(frost, max(stem * on, side));
        }
    vec3 ice = mix(vec3(0.85, 0.93, 1.0), base * 1.3, 0.25);
    col = mix(col, ice, frost * 0.95);
    col += vec3(0.5, 0.65, 0.9) * smoothstep(0.2, 0.0, frost) * 0.0;
    finish(col * 1.1);
}
