//@doc
 * @brief TEXTURE SILK VEILS: layers of sheer silk drifting in a slow breeze
 * -- translucent veils printed with the photograph billow and fold one
 * behind another, each sagging in soft catenary waves, their folds
 * gathering colour where the fabric doubles up, light shining through
 * from behind so the thin places glow; the veils slide past each other in
 * slow parallax.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the veils drift (integrated, jump-free)
 *   audioSpread     -> the billowing
 *   audioBass       -> the backlight (light)
 *   audioMode       -> the light: cool moonlight in minor, warm sunset in major
 *   audioRoughness  -> small ripples in the fabric
 *   audioSwell      -> the veils' opacity (slow)
 *
 * Knobs: veilP (number of veils), foldP (fold frequency), printP (the photo on the silk), hueP.
//@params veilP foldP printP
//@audio audioSpread audioBass audioMode audioRoughness audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float bass = clamp(audioBass, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    vec3 back = mix(vec3(0.5, 0.6, 0.85), vec3(1.0, 0.7, 0.45), mode);
    back *= (0.5 + 0.5 * bass) * (0.8 + 0.4 * smoothstep(-0.6, 0.6, p.y));
    vec3 col = back * 0.12;
    float nV = 2.0 + 3.0 * clamp(veilP, 0.0, 1.0);
    float T = 0.05 * sceneTime + 0.35 * audioAdvance;
    float bill = 0.4 + 0.8 * clamp(audioSpread, 0.0, 1.0);
    for (int k = 4; k >= 0; --k) {                              // back to front
        float fk = float(k);
        float on = smoothstep(fk - 0.5, fk + 0.5, nV - 0.5);
        if (on <= 0.0) continue;
        float h = hash11(fk * 1.73);
        // The veil's surface: folds along x, billowing with time.
        float fq = (3.0 + 5.0 * clamp(foldP, 0.0, 1.0)) * (0.8 + 0.4 * h);
        float x = p.x + T * (0.3 + 0.2 * fk) * (h > 0.5 ? 1.0 : -1.0);
        float wave = sin(x * fq + T * 2.0 + h * 6.28 + bill * sin(p.y * 2.0 + T * 1.3 + fk));
        wave += 0.3 * sin(x * fq * 2.3 - T * 1.7 + fk) + rough * 0.15 * sin(x * fq * 8.0 + p.y * 10.0 + T * 5.0);
        float slope = cos(x * fq + T * 2.0 + h * 6.28 + bill * sin(p.y * 2.0 + T * 1.3 + fk));
        // Where the fabric is seen edge-on (steep slope) it doubles up: denser.
        float dens = (0.25 + 0.35 * swell) * (0.6 + 0.8 * abs(slope));
        vec2 uv = vec2(x * 0.4 + h, p.y * 0.4 + 0.02 * wave) + 0.5;
        vec3 ph = imgLod(uv, 1.5 + fk * 0.3);
        vec3 silk = mix(vec3(0.9), ph * 1.3, clamp(printP, 0.0, 1.0) * 0.8);
        silk = mix(silk, silk * glowColour(ph, vec2(fk, h), hueP * 0.159 + h * 0.3) * 1.3, 0.3);
        // Light through the thin parts, sheen on the folds.
        vec3 through = back * silk * (1.0 - dens) * 0.9;
        vec3 sheen = silk * pow(max(0.0, wave), 3.0) * 0.5;
        float crease = pow(max(0.0, -wave), 4.0);
        vec3 veil = (through + silk * dens * 0.5 + sheen) * (1.0 - 0.5 * crease);
        // Each veil hangs down to a wavy hem; the pattern repeats every 2 units in y (endless).
        float hem = fk * 0.37 + 0.12 * sin(x * 2.1 + T * 1.5 + fk) + 0.05 * wave;
        float yy = fract((p.y - hem) * 0.5) * 2.0;             // 0..2 above the hem
        float cover = smoothstep(0.0, 0.03, yy) * smoothstep(2.0, 1.2, yy);
        col = mix(col, veil, clamp(dens + 0.35, 0.0, 1.0) * on * cover);
    }
    finish(col);
}
