//@doc
 * @brief KLINE BLACK STROKES: Franz Kline's huge black brushstrokes on white,
 * in motion -- massive beams of black paint slash across the canvas,
 * crossing in girders and arches, their edges dry and ragged where the
 * broad brush dragged, white paint cut back over them in places; the
 * strokes slowly sweep, rotate and re-form, the photograph showing
 * faintly as the ground's warm off-white and grey.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the strokes sweep (integrated, jump-free)
 *   audioSpread     -> stroke width
 *   audioRoughness  -> the dry-brush edges
 *   audioKick       -> the wet black gleams (light)
 *   audioMode       -> black on white in minor, deep blue-black on cream in major
 *   audioSwell      -> the photo in the ground (slow)
 *
 * Knobs: strokeP (stroke count), curveP (arching), photoP, hueP.
//@params strokeP curveP photoP
//@audio audioSpread audioRoughness audioKick audioMode audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    vec2 uv = p * 0.5 + 0.5;
    vec3 ground = mix(vec3(0.93, 0.92, 0.9), vec3(0.95, 0.9, 0.8), mode);
    ground = mix(ground, ground * (0.8 + 0.3 * imgLod(uv, 3.0)), 0.2 + 0.4 * swell * clamp(photoP + 0.3, 0.0, 1.3));
    vec3 ink = mix(vec3(0.03, 0.03, 0.035), vec3(0.03, 0.04, 0.09), mode);
    vec3 col = ground;
    float T = 0.03 * sceneTime + 0.2 * audioAdvance;
    float nS = 3.0 + 4.0 * clamp(strokeP, 0.0, 1.0);
    float W = 0.05 + 0.06 * clamp(audioSpread, 0.0, 1.0);
    float cover = 0.0;
    for (int k = 0; k < 7; ++k) {
        float fk = float(k);
        float on = smoothstep(fk - 0.5, fk + 0.5, nS - 0.5);
        if (on <= 0.0) break;
        float h = hash11(fk * 2.3 + 1.0);
        // A stroke: a line through a wandering point at a slowly turning angle, slightly arched.
        float ang = h * 3.14159 + 0.3 * sin(T * (0.8 + 0.4 * h) + fk);
        vec2 dir = vec2(cos(ang), sin(ang));
        vec2 nrm = vec2(-dir.y, dir.x);
        vec2 c = 0.6 * vec2(sin(T * (0.5 + 0.3 * h) + fk * 2.1), cos(T * (0.4 + 0.3 * h) + fk * 1.3));
        vec2 d = p - c;
        float along = dot(d, dir);
        float arch = (0.3 * clamp(curveP, 0.0, 1.0)) * along * along * (h - 0.5);
        float across = dot(d, nrm) - arch;
        float w = W * (0.7 + 0.6 * hash11(fk * 5.0));
        // Dry-brush edge: streaks along the stroke at its borders.
        float streak = noise2(vec2(along * 20.0, across / w * 3.0) + fk * 11.0);
        float edge = w * (1.0 - (0.15 + 0.35 * rough) * smoothstep(0.4, 0.8, streak));
        float len = 0.8 + 0.6 * h;
        float ends = smoothstep(len, len - 0.1, abs(along)) ;
        float s = smoothstep(edge + 0.003, edge - 0.003, abs(across)) * ends;
        // Where the brush ran dry at the stroke's end: broken.
        s *= 1.0 - smoothstep(len - 0.3, len, abs(along)) * smoothstep(0.3, 0.7, noise2(vec2(along * 30.0, across * 80.0)));
        cover = max(cover, s * on);
    }
    col = mix(col, ink, cover);
    // Wet gleam on the black.
    col += vec3(1.0) * cover * pow(max(0.0, noise2(p * 8.0 + vec2(0.1 * sceneTime, 0.0))), 6.0) * (0.05 + 0.3 * kick);
    // White cut back over the black in places.
    float cut = smoothstep(0.72, 0.78, fbm3(p * 2.0 + vec2(0.0, T))) * cover;
    col = mix(col, ground * 0.95, cut * 0.8);
    col = mix(col, col * glowColour(imgLod(uv, 6.0), p, hueP * 0.159) * 1.2, 0.04);
    finish(col);
}
