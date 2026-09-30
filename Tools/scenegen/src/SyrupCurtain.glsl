//@doc
 * @brief SYRUP CURTAIN: thick golden syrup pouring in a slow curtain -- a
 * wide sheet of viscous amber liquid flows down, backlit so it glows,
 * folding into ropes and coils where it thickens, thinning into glassy
 * windows where it stretches (through which the photograph behind shows,
 * bent and amber-tinted); highlights run down the ropes.  The sheet
 * repeats in bands so the plane is endless.  Mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the flow (integrated, jump-free)
 *   audioSpread     -> the curtain folds more
 *   audioBass       -> the backlight glows (light)
 *   audioMode       -> the syrup: dark maple in minor, bright honey in major
 *   audioRoughness  -> the ropes twist
 *   audioSwell      -> the glassy windows open (slow)
 *
 * Knobs: ropeP (rope count), thickP (thickness), photoP (photo through the thin parts), hueP.
//@params ropeP thickP photoP
//@audio audioSpread audioBass audioMode audioRoughness audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float bass = clamp(audioBass, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    float T = 0.25 * sceneTime + 1.5 * audioAdvance;
    // Thickness across the sheet: ropes (thick bands) running down, meandering.
    float nR = 5.0 + 8.0 * clamp(ropeP, 0.0, 1.0);
    float fold = 0.05 + 0.1 * clamp(audioSpread, 0.0, 1.0);
    float x = p.x + fold * sin(p.y * 2.0 + T * 0.3 + fbm3(vec2(p.x * 2.0, 0.0)) * 3.0);
    float ropes = 0.5 + 0.5 * cos(x * nR * 3.14159 + rough * 1.5 * sin(p.y * 6.0 - T));
    float th = (0.4 + 0.6 * clamp(thickP, 0.0, 1.0)) * (0.35 + 0.65 * pow(ropes, 1.5));
    // Flow texture: streaks sliding down.
    float streak = fbm3(vec2(x * 30.0, p.y * 2.0 + T));
    th *= 0.85 + 0.3 * streak;
    // Glassy windows where the sheet stretches thin.
    float win = smoothstep(0.55, 0.8, fbm3(vec2(x * 3.0, p.y * 1.2 + T * 0.5))) * (0.3 + 0.7 * swell);
    th *= 1.0 - 0.8 * win;
    vec3 amber = mix(vec3(0.45, 0.15, 0.02), vec3(1.0, 0.6, 0.12), mode);
    // Behind the curtain: the photo, bent by the syrup's thickness.
    vec2 uv = p * 0.5 + 0.5 + vec2(ropes - 0.5, 0.0) * 0.04 * th;
    vec3 behind = imgLod(uv, 1.0 + 2.0 * th) * (0.3 + 0.8 * clamp(photoP, 0.0, 1.0));
    // Beer-Lambert through the syrup, backlit.
    vec3 absorb = exp(-(vec3(1.0) - amber) * th * 4.0);
    vec3 back = vec3(1.0, 0.95, 0.85) * (0.6 + 0.6 * bass);
    vec3 col = (back * 0.6 + behind) * absorb;
    // Glossy highlights running down the ropes.
    float hl = pow(max(0.0, sin(x * nR * 3.14159 + 0.7)), 20.0) * (0.5 + 0.5 * sin(p.y * 8.0 + T * 2.0));
    col += vec3(1.0, 0.95, 0.85) * hl * 0.35 * (1.0 - win);
    col = mix(col, col * glowColour(behind + 1e-3, p, hueP * 0.159) * 1.2, 0.05);
    finish(col);
}
