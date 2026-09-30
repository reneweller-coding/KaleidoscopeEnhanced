//@doc
 * @brief SPIRAL STAIR WELL: looking straight down an endless spiral
 * staircase -- the steps wind around the open well in a helix, turn
 * after turn sinking into the depth, each step a slab of the photograph
 * with a bright nosing on its edge, a glowing handrail running along the
 * inner rim, and the well's wall behind the steps; we descend slowly
 * while the whole staircase turns.  Mirrorable; the steps continue
 * beyond the frame.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the descent (integrated, jump-free)
 *   audioPhase      -> the staircase turns (integrated)
 *   audioSpread     -> the well opens wider
 *   audioKick       -> lights along the handrail flare (light)
 *   audioMode       -> the light: cool in minor, warm lamplight in major
 *   audioSwell      -> the glow from the bottom (slow)
 *
 * Knobs: stepsP (steps per turn), pitchP (height per turn), photoP (photo on the steps), hueP.
//@params stepsP pitchP photoP
//@audio audioPhase audioSpread audioKick audioMode audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float spin = 0.02 * sceneTime + 0.25 * audioPhase;
    p = rot2(spin) * p;
    float r = max(length(p), 1e-4);
    float a = atan(p.y, p.x);
    float Ri = 0.35 + 0.25 * clamp(audioSpread, 0.0, 1.0);    // well radius
    float Ro = 1.0;                                            // wall radius
    float pitch = 0.8 + 1.2 * clamp(pitchP, 0.0, 1.0);         // depth per turn
    float nS = 2.0 * floor(6.0 + 6.0 * clamp(stepsP, 0.0, 1.0)); // steps per turn (even)
    float travel = 0.25 * sceneTime + 1.5 * audioAdvance;
    float af = a / 6.2831853 + 0.5;                            // 0..1 around
    // Step tops sit at depths z = pitch * (floor((af + k) * nS) / nS) - travel.
    float zIn = Ri / r;                                        // the ray reaches the well rim here
    float zOut = Ro / r;                                       // ... and the wall here
    float u0 = (zIn + travel) / pitch;                        // in turns
    float k = ceil(u0 - af);
    float s = floor((af + k) * nS);
    // The first step top at or below zIn (stepped heights may sit just above).
    if (s / nS * pitch - travel < zIn) s += 1.0;
    float zS = s / nS * pitch - travel;
    vec3 col;
    float mode = clamp(audioMode, 0.0, 1.0);
    vec3 lampC = mix(vec3(0.6, 0.8, 1.1), vec3(1.15, 0.85, 0.55), mode);
    vec3 gc = glowColour(imgLod(vec2(0.5), 6.0), vec2(travel * 0.02, 0.0), hueP * 0.159);
    // Derivatives before the branch (they are undefined in divergent code).
    float fwr = fwidth(r);
    vec2 cfw = fwidth(vec2(cos(a), sin(a)));
    float fwzO = fwidth(zOut);
    if (zS < zOut) {
        // On a step: where on its top face?
        float rho = r * zS;                                    // radius on the step
        float within = fract((af + k) * nS);                   // 0..1 along the step (angle)
        // Which step we are on varies with angle too; recompute its angular position.
        float stepA = (s / nS - k - 0.5) * 6.2831853;          // start angle of the step
        vec2 sp = rho * vec2(cos(a), sin(a));
        vec2 suv = sp * 0.6 + vec2(hash11(s * 0.13), hash11(s * 0.71)) + 0.5;
        float fw = fwr * zS * 0.6 * 1024.0;
        vec3 ph = imgLod(suv, clamp(log2(max(fw, 1.0)), 0.0, 9.0));
        vec3 stone = mix(vec3(0.5, 0.48, 0.45), ph, clamp(photoP, 0.0, 1.0));
        float fog = exp(-zS * 0.35);
        // Light from above falls on the steps; the nosing (step front edge) is bright.
        float angPos = fract((a / 6.2831853 + 0.5 + k) * nS - s + 1.0);
        float nose = smoothstep(0.08, 0.0, 1.0 - angPos) + smoothstep(0.05, 0.0, angPos) * 0.5;
        col = stone * lampC * (0.45 + 0.55 * smoothstep(Ro, Ri, rho));
        col *= 1.0 - 0.45 * smoothstep(0.2, 0.0, angPos);      // shadow under the step above
        col += lampC * nose * 0.25;
        // The handrail at the inner rim with lamps.
        float rail = exp(-abs(rho - Ri * 1.04) / (0.012 * zS + 0.003));
        float lampAt = pow(0.5 + 0.5 * cos(within * 6.2831853), 20.0);
        col += gc * rail * (0.6 + (0.8 + 1.5 * kick) * lampAt);
        col = mix(gc * (0.1 + 0.5 * swell), col, fog);
    } else {
        // The wall of the well behind/under the steps.
        float zW = zOut;
        vec2 wuv = vec2(a / 3.14159265, (zW + travel) * 0.3);
        float fw = max(length(cfw) / 3.14159265, fwzO * 0.3) * 1024.0;
        vec3 wall = imgLod(wuv, clamp(log2(max(fw, 1.0)), 0.0, 9.0)) * 0.5;
        float fog = exp(-zW * 0.35);
        col = mix(gc * (0.1 + 0.5 * swell), wall * lampC, fog);
    }
    // The open well: the glow of the bottom far below.
    col += gc * exp(-r / Ri * 3.0) * (0.3 + 0.8 * swell);
    finish(col);
}
