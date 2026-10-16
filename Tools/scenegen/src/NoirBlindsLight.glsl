//@doc
 * @brief NOIR BLINDS LIGHT: light falling through venetian blinds into a smoky
 * room -- hard bars of light lie across drifting smoke, everything between them
 * is black.  Where a bar meets the smoke the photograph shows through in silver
 * tones, so the bars carry another picture every time; the blinds turn slowly,
 * their bars bend over the smoke's folds, and the whole field drifts.  Endless
 * and mirrorable: no floor, no up and down.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the smoke drifts (integrated, jump-free)
 *   audioPhase      -> the blinds turn (integrated)
 *   audioSpread     -> the slats open: wider bars of light
 *   audioRoughness  -> the smoke curls tighter
 *   audioMode       -> the light's temperature: moonlight in minor, tungsten in major (slow blend)
 *   audioHarmChange -> the bars breathe open (slow envelope)
 *   audioBass       -> the light's strength (light)
 *
 * Knobs: slatsP (bars across the frame), smokeP (smoke density), silverP (how much
 * of the photo the light shows), tiltP (the blinds' angle), hueP (the light's tint).
//@params slatsP smokeP silverP tiltP
//@audio audioPhase audioSpread audioRoughness audioMode audioHarmChange audioBass
//@body
void main()
{
    vec2 p = screenP();
    float rough = clamp(audioRoughness, 0.0, 1.0);
    float spread = clamp(audioSpread, 0.0, 1.0);
    float bass = clamp(audioBass, 0.0, 1.0);
    // Smoke: a slowly drifting, curling density field; the photo's broad masses steer it.
    vec2 q = p * (1.6 + 0.8 * rough) + vec2(0.05 * sceneTime + 0.3 * audioAdvance, 0.013 * sceneTime);
    vec2 warp = vec2(fbm3(q + 1.7), fbm3(q.yx - 3.1)) - 0.5;
    float mass = luma(imgLod(p * 0.35 + 0.5 + 0.1 * warp, 6.0));
    float f = fbm(q + 1.8 * warp + 0.6 * mass);
    float wisp = 1.0 - abs(2.0 * fbm(q * 1.7 + 2.4 * warp + 5.3) - 1.0);   // ridges: the smoke's filaments
    float body = smoothstep(0.36 - 0.18 * clamp(smokeP, 0.0, 1.0), 0.80, f);
    float smoke = clamp(0.6 * body + 0.8 * pow(wisp, 5.0), 0.0, 1.0);
    // Blinds: bars across a slowly turning direction, their phase bent by the smoke.
    float ang = 0.6 + 1.2 * clamp(tiltP, 0.0, 1.0) + 0.02 * sceneTime + 0.15 * audioPhase;
    vec2 dir = vec2(cos(ang), sin(ang));
    float n = 7.0 + 14.0 * clamp(slatsP, 0.0, 1.0);
    float u = dot(p, dir) * n + 0.5 * body + 0.07 * sceneTime;   // the bars bend over the smoke's body
    float open = 0.30 + 0.20 * spread + 0.08 * clamp(audioHarmChange, 0.0, 1.0);
    float tri = abs(fract(u) - 0.5) * 2.0;      // 0 in a bar's middle, 1 at its edge (continuous)
    float fw = fwidth(u) * 2.0;
    float hard = smoothstep(open + fw, open - fw, tri);
    float soft = smoothstep(open + 0.30, open - 0.30, tri);
    // The penumbra: across the frame the bars go from razor-sharp to soft (as if farther from the window).
    float pen = 0.5 + 0.5 * sin(dot(p, vec2(-dir.y, dir.x)) * 1.4 + 0.031 * sceneTime);
    float bar = mix(hard, soft, 0.7 * pen);
    // Light: moonlight to tungsten, a touch of hueP.
    vec3 moon = vec3(0.70, 0.80, 1.00), tung = vec3(1.00, 0.80, 0.56);
    vec3 lightC = mix(moon, tung, clamp(audioMode, 0.0, 1.0));
    lightC = mix(lightC, hsv2rgb(vec3(hueP, 0.35, 1.0)), 0.15);
    // The lit smoke shows the photo in silver tones.
    vec3 ph = imgLod(p * 0.6 + 0.5 + 0.06 * warp, 3.0);
    float silver = mix(0.6, smoothstep(0.08, 0.92, luma(ph)), clamp(silverP, 0.0, 1.0));
    // The light falls in broad pools that wander (the window's patch on the smoke), the rest stays dark.
    float pool = smoothstep(0.30, 0.62, fbm3(p * 0.55 + vec2(0.011 * sceneTime, -0.017 * sceneTime) + 0.2 * audioPhase));
    float lit = 2.3 * bar * (0.22 + 0.78 * smoke) * (0.45 + 1.1 * silver) * (0.35 + 0.65 * pool);
    vec3 col = lightC * lit * (0.9 + 0.5 * bass);
    // Between the bars the smoke catches a trace of scattered light -- black, but not dead.
    col += lightC * 0.05 * smoke * pool;
    finish(col);
}
