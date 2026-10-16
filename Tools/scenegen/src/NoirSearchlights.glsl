//@doc
 * @brief NOIR SEARCHLIGHTS: searchlight beams sweeping through a hazy night --
 * three to six beams come in from beyond the frame, swing slowly, cross and
 * part again; they only show where they meet the haze, which drifts and curls
 * and is made of the photograph's own masses, so each beam carries a moving
 * piece of the picture in silver.  Where two beams cross the haze burns
 * brightest.  Endless and mirrorable: the lamps stand all round, no ground.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the haze drifts (integrated, jump-free)
 *   audioPhase      -> the beams sweep (integrated)
 *   audioSpread     -> the beams widen
 *   audioRoughness  -> the haze curls tighter
 *   audioMode       -> the light's temperature: cold in minor, warm in major (slow blend)
 *   audioHarmChange -> the beams swing further out (slow envelope)
 *   audioBass       -> the lamps' strength (light)
 *
 * Knobs: beamsP (how many lamps, set per activation), hazeP (haze density),
 * photoP (how much the haze is the photo), reachP (how far the beams carry), hueP (tint).
//@params beamsP hazeP photoP reachP
//@audio audioPhase audioSpread audioRoughness audioMode audioHarmChange audioBass
//@body
void main()
{
    vec2 p = screenP();
    float bass = clamp(audioBass, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    // Haze: drifting, curling, shaped by the photo's broad masses.
    vec2 q = p * (1.8 + 0.8 * rough) + vec2(0.035 * sceneTime + 0.2 * audioAdvance, 0.017 * sceneTime);
    vec2 w = vec2(fbm3(q + 2.3), fbm3(q.yx - 1.1)) - 0.5;
    float photo = luma(imgLod(p * 0.4 + 0.5 + 0.1 * w, 4.5));
    float m = luma(imgLod(vec2(0.5), 9.0));
    float haze = mix(fbm(q + 1.5 * w), smoothstep(0.3 * m, 1.6 * m + 0.1, photo), 0.6 * clamp(photoP, 0.0, 1.0))
                 + 0.3 * (fbm3(q * 3.1 + 2.0 * w) - 0.5);
    haze = smoothstep(0.35 - 0.2 * clamp(hazeP, 0.0, 1.0), 0.85, haze);
    // The beams: lamps on a ring beyond the frame, each swinging on its own slow sine.
    float n = floor(3.0 + 3.99 * clamp(beamsP, 0.0, 1.0));
    float width = 0.012 + 0.02 * clamp(audioSpread, 0.0, 1.0);
    float swing = 0.35 + 0.25 * clamp(audioHarmChange, 0.0, 1.0);
    float reach = 1.2 + 1.4 * clamp(reachP, 0.0, 1.0);
    float light = 0.0;
    for (int i = 0; i < 6; ++i)
    {
        if (float(i) >= n)
            break;
        float fi = float(i);
        float base = 6.2831853 * (fi + 0.37 * hash11(fi + 3.0)) / n + 0.006 * sceneTime;
        vec2 o = 1.25 * vec2(cos(base), sin(base)) * vec2(1.6, 1.0);
        float sweep = base + 3.14159265 + swing * sin(0.11 * sceneTime * (0.7 + 0.6 * hash11(fi)) + 0.25 * audioPhase + 6.0 * hash11(fi + 9.0));
        vec2 dir = vec2(cos(sweep), sin(sweep));
        vec2 rel = p - o;
        float along = dot(rel, dir);
        float off = abs(rel.x * dir.y - rel.y * dir.x);
        float wd = width * (1.0 + 0.35 * max(along, 0.0));
        float core = exp(-(off * off) / (wd * wd)) + 0.12 * exp(-off / (wd * 6.0));   // the beam and its halo
        light += core * smoothstep(0.0, 0.25, along) * exp(-max(along, 0.0) / reach);
    }
    vec3 cold = vec3(0.74, 0.83, 1.0), warm = vec3(1.0, 0.85, 0.64);
    vec3 lightC = mix(mix(cold, warm, clamp(audioMode, 0.0, 1.0)), hsv2rgb(vec3(hueP, 0.35, 1.0)), 0.1);
    vec3 col = lightC * light * (0.15 + 1.2 * haze) * (0.8 + 0.5 * bass) * 1.5;
    col += lightC * 0.02 * haze;           // the night itself, barely
    finish(col);
}
