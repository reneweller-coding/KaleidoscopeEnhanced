//@doc
 * @brief NOIR SMOKE BACKLIGHT: a lamp behind drifting smoke -- the smoke stands
 * black against the light, its thin edges burn silver, and where it opens the
 * light breaks through in shafts that sweep across the frame as the smoke
 * moves.  The smoke is made of the photograph's own masses, carried along and
 * curled, so every photo gives another smoke.  The lamp wanders slowly, now
 * inside the frame, now just outside it.  Endless and mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the smoke drifts (integrated, jump-free)
 *   audioPhase      -> the lamp wanders (integrated)
 *   audioSpread     -> the shafts reach farther
 *   audioRoughness  -> the smoke curls tighter
 *   audioMode       -> the light's temperature: cold in minor, warm in major (slow blend)
 *   audioHarmChange -> the lamp swells (slow envelope)
 *   audioBass       -> the lamp's strength (light)
 *
 * Knobs: densP (smoke density), shaftP (how much the shafts scatter), photoP (how
 * much the photo shapes the smoke), sizeP (smoke scale), hueP (the light's tint).
//@params densP shaftP photoP sizeP
//@audio audioPhase audioSpread audioRoughness audioMode audioHarmChange audioBass
//@body
/**  The smoke's density at a point: drifting, curled noise mixed with the photo's broad masses.
 *
 * @param p      The point (screen coordinates). (in)
 * @param rough  The music's roughness, 0..1: tighter curls. (in)
 *
 * @return
 *   Density 0..1 (0 clear air, 1 opaque smoke).
 **/
float smokeAt(vec2 p, float rough)
{
    vec2 q = p * (2.0 + 1.6 * clamp(sizeP, 0.0, 1.0)) * (1.0 + 0.4 * rough)
             + vec2(0.04 * sceneTime + 0.25 * audioAdvance, -0.021 * sceneTime);
    vec2 w = vec2(fbm3(q + 4.1), fbm3(q.yx + 1.3)) - 0.5;
    float photo = luma(imgLod(p * 0.3 + 0.5 + 0.12 * w, 5.0));
    float d = mix(fbm3(q + 1.6 * w), photo, 0.5 * clamp(photoP, 0.0, 1.0)) + 0.35 * (fbm3(q * 2.7 + 2.0 * w) - 0.5);
    return smoothstep(0.34 - 0.14 * clamp(densP, 0.0, 1.0), 0.50, d);
}
/**  The lamp's own light at an offset from it: a compact core and a short halo.
 *
 * @param d  The offset from the lamp. (in)
 *
 * @return
 *   The light's strength there.
 **/
float lampLight(vec2 d)
{
    return 0.012 / (dot(d, d) + 0.004) + 0.9 * exp(-length(d) * 3.2);
}
void main()
{
    vec2 p = screenP();
    float rough = clamp(audioRoughness, 0.0, 1.0);
    float bass = clamp(audioBass, 0.0, 1.0);
    // The lamp: wanders on a slow Lissajous path, sometimes just outside the frame.
    float wt = 0.012 * sceneTime + 0.08 * audioPhase;
    vec2 lamp = vec2(0.75 * sin(wt * 1.3 + 0.4), 0.42 * sin(wt * 1.7 + 2.1));
    float here = smokeAt(p, rough);
    float swell = 1.0 + 0.5 * clamp(audioHarmChange, 0.0, 1.0);
    // Shafts (screen-space light scattering): the light that comes through the gaps, gathered along the way to
    // the lamp with a falloff -- where the smoke opens, a shaft; where it closes, its shadow.
    vec2 toL = lamp - p;
    float reach = 0.6 + 0.4 * clamp(audioSpread, 0.0, 1.0);
    float rays = 0.0, fall = 1.0;
    for (int i = 1; i <= 16; ++i)
    {
        vec2 x = p + toL * (float(i) / 16.0) * reach;
        vec2 dx = lamp - x;
        rays += fall * lampLight(dx) * (1.0 - smokeAt(x, rough));
        fall *= 0.92;
    }
    rays *= swell / 16.0;
    float dist2 = dot(toL, toL);
    float g0 = swell * lampLight(toL);
    vec3 cold = vec3(0.72, 0.82, 1.0), warm = vec3(1.0, 0.82, 0.58);
    vec3 lightC = mix(mix(cold, warm, clamp(audioMode, 0.0, 1.0)), hsv2rgb(vec3(hueP, 0.4, 1.0)), 0.12);
    float direct = g0 * (1.0 - here);                       // the lamp seen through a gap here
    float rim = here * (1.0 - here) * 4.0 * g0 * 0.7;       // the smoke's thin edge burns
    vec3 col = lightC * (0.6 * direct + rays * (1.6 + 2.4 * clamp(shaftP, 0.0, 1.0)) * (1.0 - 0.8 * here) + rim)
               * (0.7 + 0.6 * bass);
    finish(col);
}
