//@doc
 * @brief INK DROPS FALLING: drops of ink falling into a tank of clear water,
 * seen from the side against a bright, softly blurred photograph -- each
 * drop plunges in and becomes a descending vortex ring, a mushroom head
 * curling outward with a thin stem trailing behind, the head spreading,
 * branching into smaller rings and finally dissolving into a coloured
 * cloud; dozens of plumes at different depths, each ink its own colour,
 * absorbing the light like real dye.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the plumes sink (integrated, jump-free)
 *   audioSpread     -> how wide the heads spread
 *   audioRoughness  -> turbulence in the plumes
 *   audioBass       -> the backlight brightens (light)
 *   audioMode       -> ink colours: cool in minor, warm in major
 *   audioSwell      -> ink strength (slow)
 *
 * Knobs: dropsP (plume density), inkP (ink darkness), photoP (photo behind), hueP.
//@params dropsP inkP photoP
//@audio audioSpread audioRoughness audioBass audioMode audioSwell
//@body
// Density of one plume at local coords l (head at origin, y up), age 0..1.
float plume(vec2 l, float age, float spread, float seed)
{
    float s = 0.03 + 0.08 * age * spread;                         // head size grows
    float amp = smoothstep(0.0, 0.05, age) * (1.0 - smoothstep(0.55, 1.0, age));
    // Vortex ring head: two curling lobes.
    vec2 m = vec2(abs(l.x), l.y);
    float rw = s * 1.2;
    vec2 lob = m - vec2(rw, 0.0);
    float curl = atan(lob.y, lob.x) + length(lob) / s * 2.0;
    float head = exp(-dot(lob, lob) / (s * s * 0.6)) * (0.7 + 0.3 * sin(curl * 2.0 + seed));
    head += 0.6 * exp(-dot(l - vec2(0.0, s * 0.2), l - vec2(0.0, s * 0.2)) / (s * s * 0.5));
    // Second generation: two smaller rings dropping from the head late in life.
    float br = smoothstep(0.35, 0.7, age);
    vec2 c2 = vec2(rw * 1.6, -s * 2.0 * br);
    float sub = exp(-dot(m - c2, m - c2) / (s * s * 0.25)) * br;
    // The stem trailing up to where the drop entered.
    float stem = exp(-l.x * l.x / (0.0001 + s * s * 0.04)) * step(0.0, l.y) * exp(-l.y * (1.5 + 3.0 * age)) * 0.5;
    return (head + sub * 0.8 + stem) * amp / (1.0 + age * 2.0);
}

void main()
{
    vec2 p = screenP();
    float bass = clamp(audioBass, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    float spread = 0.6 + 0.8 * clamp(audioSpread, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    // Turbulence warps the water.
    vec2 tw = (vec2(fbm3(p * 4.0 + vec2(0.0, 0.05 * sceneTime)), fbm3(p * 4.0 + 7.0 - vec2(0.0, 0.05 * sceneTime))) - 0.5) * (0.02 + 0.05 * rough);
    vec3 absorb = vec3(0.0);
    float T = 0.05 * sceneTime + 0.3 * audioAdvance;
    for (int L = 0; L < 3; ++L) {
        float fl = float(L);
        float cw = (0.45 - 0.15 * clamp(dropsP, 0.0, 1.0)) * (1.0 - 0.25 * fl);
        vec2 q = p + tw * (1.0 + fl) + vec2(fl * 1.7, 0.0);
        float ci = floor(q.x / cw);
        for (int i = -1; i <= 1; ++i) {
            float c = ci + float(i);
            // Two drops per column, half a cycle apart.
            for (int g = 0; g < 2; ++g) {
                float fg = float(g);
                float rate = 0.6 + 0.5 * hash11(c * 1.3 + fl * 7.0 + fg);
                float cyc = T * rate + hash11(c + fl * 3.0 + fg * 11.0) + fg * 0.5;
                float gen = floor(cyc);                            // generation (fades to 0 at the wrap)
                float age = fract(cyc);
                float hx = hash11(c * 3.1 + gen * 1.7 + fg * 5.0 + fl);
                vec2 head = vec2((c + 0.2 + 0.6 * hx) * cw, 0.62 - age * 1.5 * (0.7 + 0.3 * hx));
                float d = plume((q - head) * (1.0 + 0.3 * fl), age, spread, hx * 6.28);
                float hk = hash11(gen * 0.37 + c * 0.91 + fg * 0.13 + fl);
                vec3 ink = glowColour(imgLod(vec2(hk, fract(hk * 7.3)), 4.0), vec2(hk * 10.0, fl), hueP * 0.159 + hk * 0.5);
                ink = mix(ink, ink * mix(vec3(0.7, 0.9, 1.2), vec3(1.2, 0.85, 0.6), mode), 0.5);
                // Absorption: the ink removes its complementary light.
                absorb += d * (vec3(1.0) - ink * 0.85) / (1.0 + fl * 0.6);
            }
        }
    }
    float strength = (1.5 + 3.0 * clamp(inkP, 0.0, 1.0)) * (0.6 + 0.6 * swell);
    vec2 uv = p * 0.6 + 0.5 + vec2(0.003, 0.0) * sceneTime;
    vec3 back = mix(vec3(0.92, 0.94, 0.95), imgLod(uv, 5.0) * 1.2 + 0.25, 0.5 * clamp(photoP, 0.0, 1.0));
    back *= (0.75 + 0.35 * bass) * (1.0 - 0.25 * length(p));
    vec3 col = back * exp(-absorb * strength);
    finish(col);
}
