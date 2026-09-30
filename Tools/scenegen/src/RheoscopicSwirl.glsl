//@doc
 * @brief RHEOSCOPIC SWIRL: a rheoscopic fluid -- water filled with tiny
 * pearly flakes that line up with the flow, so every current, eddy and
 * shear layer becomes visible as silky bands of light and shadow, shimmering
 * like mother-of-pearl.  Slow vortices turn and merge, thin shear lines
 * wind around them, and the dye in the fluid takes its colours from the
 * photograph (where it is grey, a soft pearly hue field).  The whole frame
 * flows continuously; an endless field that mirrors without seams.
 *
 * The flake orientation follows the local strain of a slowly evolving
 * divergence-free flow; brightness is how much the flakes face the light.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the fluid's motion (integrated, jump-free)
 *   audioSpread     -> the vortex scale (wide spectrum = smaller, busier eddies)
 *   audioRoughness  -> fine turbulence on the shear lines
 *   audioMode       -> the pearl sheen warms in major
 *   audioHigh       -> the glitter of the flakes (light)
 *   audioSwell      -> sheen strength (slow)
 *
 * Knobs: scaleP (eddy scale), dyeP (how much colour), speedP (flow speed), hueP.
//@params scaleP dyeP speedP
//@audio audioSpread audioRoughness audioMode audioHigh audioSwell
//@body
float gT;

// Stream function of the flow: a few slowly drifting vortices plus noise.
float psi(vec2 q)
{
    float s = 0.0;
    for (int k = 0; k < 5; ++k) {
        float fk = float(k);
        vec2 c = vec2(sin(gT * (0.11 + 0.03 * fk) + fk * 2.1), cos(gT * (0.09 + 0.02 * fk) + fk * 1.3)) * 1.1;
        float sgn = (mod(fk, 2.0) < 0.5) ? 1.0 : -1.0;
        vec2 d = q - c;
        s += sgn * exp(-dot(d, d) * 1.4);
    }
    s += 0.35 * (fbm3(q * 1.2 + vec2(gT * 0.05, 0.0)) - 0.5);
    return s;
}

void main()
{
    vec2 p = screenP();
    float swell = clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    gT = sceneTime * (0.4 + 0.8 * clamp(speedP, 0.0, 1.0)) * 0.3 + 1.2 * audioAdvance;
    float sc = (1.2 + 1.2 * clamp(scaleP, 0.0, 1.0)) * (0.8 + 0.5 * clamp(audioSpread, 0.0, 1.0));
    vec2 q = p * sc;

    // Velocity = perpendicular gradient of the stream function; the flakes
    // align with it.  Warp the sampling point back along the flow a little,
    // so the pattern is advected (streaky), not just a static field.
    float e = 0.01;
    vec2 g = vec2(psi(q + vec2(e, 0.0)) - psi(q - vec2(e, 0.0)), psi(q + vec2(0.0, e)) - psi(q - vec2(0.0, e))) / (2.0 * e);
    vec2 vel = vec2(g.y, -g.x);
    float speed = length(vel);
    vec2 dir = vel / (speed + 1e-4);
    // Shear bands: fine streaks along the flow (a line-integral of noise).
    float band = 0.0;
    vec2 w = q;
    for (int i = 0; i < 10; ++i) {
        vec2 gg = vec2(psi(w + vec2(e, 0.0)) - psi(w - vec2(e, 0.0)), psi(w + vec2(0.0, e)) - psi(w - vec2(0.0, e)));
        vec2 v = normalize(vec2(gg.y, -gg.x) + 1e-5);
        w += v * 0.035;
        band += noise2(w * vec2(22.0) + vec2(0.0, gT * 0.3));
    }
    band /= 10.0;
    band += 0.15 * clamp(audioRoughness, 0.0, 1.0) * (noise2(q * 60.0 + gT) - 0.5);
    // Flake reflectance: flakes aligned with the flow face the light differently
    // depending on the flow direction relative to the light.
    vec2 L = normalize(vec2(cos(0.3), sin(0.3)));
    float face = pow(abs(dot(dir, L)), 2.0);
    float bandC = smoothstep(0.3, 0.7, band);
    float sheen = pow(face, 1.5) * (0.25 + 1.2 * bandC) * (0.5 + 0.7 * smoothstep(0.0, 1.5, speed));
    // Pearly iridescence varying with the flake angle.
    float mode = clamp(audioMode, 0.0, 1.0);
    vec3 pearl = hsv2rgb(vec3(fract(mix(0.55, 0.08, mode) + 0.25 * dot(dir, vec2(0.7, 0.7)) + 0.1 * band), 0.3, 1.0));
    // Dye: the photo's colour, advected with the flow (sampled back along it).
    vec2 duv = q * 0.25 + 0.5 - vel * 0.02;
    vec3 ph = imgLod(duv, 4.0);
    vec3 dye = glowColour(ph, q * 0.4, hueP * 0.159) * (0.5 + 0.7 * luma(ph));
    vec3 base = mix(vec3(0.03, 0.035, 0.05), dye * 0.35, clamp(dyeP, 0.0, 1.0) * 0.7 + 0.15);
    vec3 col = base * (1.0 - 0.4 * sheen) + mix(pearl, dye * 1.3 + 0.2, 0.3 * clamp(dyeP, 0.0, 1.0)) * sheen * (0.8 + 0.6 * swell);
    // Glitter: individual flakes catching the light, round points.
    vec2 gq = q * 90.0, gi = floor(gq);
    float gl = step(0.985, hash21(gi)) * smoothstep(0.35, 0.0, length(fract(gq) - 0.5)) * face * bandC;
    col += vec3(1.0) * gl * (0.2 + 1.0 * hi);
    finish(col);
}
