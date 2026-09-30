//@doc
 * @brief TEXTURE FAN FOLD: the photograph printed on a huge sheet of paper
 * folded like an accordion -- pleats run across the picture, each face
 * tilted alternately toward and away from the light, the image squeezed
 * on the faces that turn away; the pleats slowly fold tighter and open
 * flat again in travelling waves, their direction turning, so the picture
 * ripples in and out of legibility.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the fold waves travel (integrated, jump-free)
 *   audioPhase      -> the pleat direction turns (integrated)
 *   audioSpread     -> how deep the pleats fold
 *   audioKick       -> the ridge lines catch light (light)
 *   audioMode       -> light temperature: cool in minor, warm in major
 *   audioSwell      -> the shadow depth (slow)
 *
 * Knobs: pleatP (pleat width), waveP (fold wave length), paperP (paper texture), hueP.
//@params pleatP waveP paperP
//@audio audioPhase audioSpread audioKick audioMode audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float dirA = 0.4 * sin(0.013 * sceneTime) + 0.25 * audioPhase;
    vec2 d = vec2(cos(dirA), sin(dirA));
    vec2 t = vec2(-d.y, d.x);
    float u = dot(p, d), v = dot(p, t);
    float W = 0.03 + 0.05 * clamp(pleatP, 0.0, 1.0);            // pleat width (flat)
    float T = 0.2 * sceneTime + 1.5 * audioAdvance;
    // Fold angle: travelling waves of folding and opening.
    float wl = 1.0 + 2.0 * clamp(waveP, 0.0, 1.0);
    float fold = (0.35 + 0.5 * clamp(audioSpread, 0.0, 1.0)) * (0.5 + 0.5 * sin(u * 6.2831853 / wl - T + 0.8 * sin(v * 2.0 + 0.3 * T)));
    float ang = fold * 1.3;                                     // up to ~75 degrees
    // Projected pleat widths: faces facing us (a) and turned away (b).
    float ca = cos(ang);
    float pw = 2.0 * W * ca;                                    // one pleat pair on screen
    float k = floor(u / pw);
    float f = (u - k * pw) / pw;                                // 0..1 over the pair
    float face = step(0.5, f);                                  // 0 = face A, 1 = face B
    // The paper coordinate (unfolded): the photo lies on the flat sheet.
    float flatU = k * 2.0 * W + (f < 0.5 ? f * 2.0 * W : W + (f - 0.5) * 2.0 * W);
    vec2 uv = (d * flatU + t * v) * 0.6 + 0.5 + vec2(0.003, 0.002) * sceneTime;
    vec3 ph = imgK(uv, 0.8);
    // Lighting: face A tilted toward the light, face B away.
    vec3 lc = mix(vec3(0.85, 0.92, 1.1), vec3(1.1, 0.95, 0.8), mode);
    float lit = face < 0.5 ? 0.75 + 0.35 * sin(ang) : 0.75 - (0.45 + 0.3 * swell) * sin(ang);
    vec3 col = ph * lit * lc;
    // Paper grain.
    col *= 1.0 - 0.06 * clamp(paperP, 0.0, 1.0) * noise2(vec2(flatU, v) * 300.0);
    // Ridges (the fold lines) catch light; valleys shade.
    float px = fwidth(f) * 1.5 + 1e-4;
    float ridge = exp(-min(f, 1.0 - f) / px);
    float valley = exp(-abs(f - 0.5) / px);
    vec3 gc = glowColour(imgK(uv, 5.0), p, hueP * 0.159);
    col += mix(gc, vec3(1.0), 0.5) * ridge * sin(ang) * (0.2 + 0.8 * kick);
    col *= 1.0 - 0.5 * valley * sin(ang);
    finish(col);
}
