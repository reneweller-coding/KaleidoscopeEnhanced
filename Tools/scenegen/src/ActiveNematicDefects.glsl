//@doc
 * @brief ACTIVE NEMATIC DEFECTS: a living liquid crystal -- a dense carpet of
 * rod-like filaments that align with their neighbours and push, so the
 * whole field churns in never-ending turbulence: the rods bend into bands
 * and swirls, and topological defects wander through them, comet-shaped
 * +1/2 defects that swim head-first and three-armed -1/2 defects that
 * drift, pairs born and annihilating.  Seen between crossed polarisers the
 * rods glow in interference colours by their orientation; the photo tints
 * the colour wheel.  Endless and mirrorable, every frame different.
 *
 * The director field is built from moving +/-1/2 defects (the angle of a
 * nematic around a defect of charge k is k times the polar angle), plus a
 * slow bend field; it is drawn by line-integral streaks along the director.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the defects swim (integrated, jump-free)
 *   audioSpread     -> how many defect pairs are active (blended in and out)
 *   audioRoughness  -> the rods buckle into finer bends
 *   audioMode       -> the interference palette shifts warm in major
 *   audioHigh       -> the defect cores sparkle (light)
 *   audioSwell      -> brightness of the polarised glow (slow)
 *
 * Knobs: defectsP (base number of defects), streakP (rod length), paletteP
 * (polariser palette vs. photo colours), hueP.
//@params defectsP streakP paletteP
//@audio audioSpread audioRoughness audioMode audioHigh audioSwell
//@body
float gT, gN, gRough;

// Defects come in +1/2 / -1/2 pairs (as they do physically): a pair is born
// and annihilates by its two members meeting.  With full charges the angle
// jumps across the cut are multiples of pi, which a nematic does not see.
vec2 pairCentre(float i)
{
    float a = gT * (0.05 + 0.03 * hash11(i * 3.1)) + hash11(i) * 6.28;
    return vec2(1.3 * sin(a + i) + 0.35 * sin(a * 2.3 + i * 5.0), 0.8 * cos(a * 0.8 + i * 2.0) + 0.3 * cos(a * 1.9 + i));
}
vec2 pairAxis(float i) { float a = gT * 0.07 * (hash11(i * 7.7) - 0.5) + hash11(i * 5.3) * 6.28; return vec2(cos(a), sin(a)); }
float pairSep(float i) { return 0.45 * smoothstep(i - 0.5, i + 0.5, gN); }
vec2 defectPos(float k)                     // k even: + member, odd: - member
{
    float i = floor(k * 0.5);
    float sgn = (mod(k, 2.0) < 0.5) ? 1.0 : -1.0;
    return pairCentre(i) + sgn * pairSep(i) * pairAxis(i);
}

float director(vec2 q)
{
    float th = 0.0;
    for (int k = 0; k < 10; ++k) {
        float fk = float(k);
        vec2 d = q - defectPos(fk);
        float charge = (mod(fk, 2.0) < 0.5) ? 0.5 : -0.5;
        th += charge * atan(d.y, d.x);
    }
    th += 1.2 * (fbm3(q * (0.5 + 0.8 * gRough) + gT * 0.02) - 0.5);
    return th;
}

void main()
{
    vec2 p = screenP() * 1.6;
    float swell = clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    gT = sceneTime * 0.5 + 3.0 * audioAdvance;
    gRough = clamp(audioRoughness, 0.0, 1.0);
    gN = 1.0 + 2.0 * clamp(defectsP, 0.0, 1.0) + 2.0 * clamp(audioSpread, 0.0, 1.0);    // active pairs

    // Line integral along the director (a nematic has no arrow: the streak
    // goes both ways).
    float len = 0.006 + 0.01 * clamp(streakP, 0.0, 1.0);
    float th0 = director(p);
    vec2 dirF = vec2(cos(th0), sin(th0));
    vec2 a = p, b = p;
    vec2 da = dirF, db = -dirF;
    float acc = 0.0;
    for (int i = 0; i < 12; ++i) {
        float t1 = director(a); vec2 v1 = vec2(cos(t1), sin(t1)); if (dot(v1, da) < 0.0) v1 = -v1; da = v1; a += v1 * len;
        float t2 = director(b); vec2 v2 = vec2(cos(t2), sin(t2)); if (dot(v2, db) < 0.0) v2 = -v2; db = v2; b += v2 * len;
        acc += noise2(a * 160.0) + noise2(b * 160.0);
    }
    float rods = smoothstep(0.35, 0.7, acc / 24.0);

    // Crossed polarisers: brightness sin^2(2 theta), interference hue by angle.
    float bright = pow(sin(2.0 * th0), 2.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    vec3 polC = hsv2rgb(vec3(fract(th0 / 3.14159 + mix(0.55, 0.05, mode)), 0.75, 1.0));
    vec3 ph = imgLod(p * 0.3 + 0.5, 5.0);
    vec3 photoC = glowColour(ph, p * 0.5 + 0.3 * vec2(cos(2.0 * th0), sin(2.0 * th0)), hueP * 0.159);
    vec3 c = mix(polC, photoC, 0.6 * (1.0 - clamp(paletteP, 0.0, 1.0)));
    vec3 col = c * (0.12 + 0.95 * bright) * (0.45 + 0.75 * rods) * (0.7 + 0.6 * swell);
    // Defect cores: bright points where the order breaks down.
    for (int k = 0; k < 10; ++k) {
        float fk = float(k);
        float w = smoothstep(0.02, 0.15, pairSep(floor(fk * 0.5)));
        float d = length(p - defectPos(fk));
        col += vec3(1.0, 0.95, 0.9) * exp(-d * d * 900.0) * w * (0.3 + 1.0 * hi);
    }
    finish(col);
}
