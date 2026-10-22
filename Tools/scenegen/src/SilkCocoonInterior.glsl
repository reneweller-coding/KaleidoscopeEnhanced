//@doc
 * @brief SILK COCOON INTERIOR: inside a silk cocoon: glossy threads wound round and round the space in layer upon layer,
 * crossing at many angles, the light from outside shining through where the layers thin, breathing with the music.
 * The threads are five layers wound round the tube, each at its own slant with a whole number of turns round so it
 * closes on itself; every thread is a bright fine line with a sheen that depends on its slant against the light, and
 * the light shining through follows a slow noise of the cocoon's thickness.  The silk is shades of one colour family,
 * the light behind it the photo, calmed toward it.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the light breathes through the silk
 *   audioPhase   -> the light outside circles slowly (integrated)
 *   audioAdvance -> the drift through the cocoon (integrated)
 *
 * Knobs: threadP (how fine the threads are), glossP (the sheen's strength), hueP.
//@params threadP glossP
//@audio audioSwell audioPhase
//@body
/**  The photo's colour calmed toward the colour family.
 *
 * @param photo  The photo's colour. (in)
 * @param fh     The family's hue. (in)
 *
 * @return
 *   The colour.
 **/
vec3 tone(vec3 photo, float fh)
{
    float l = luma(photo);
    return mix(photo * 1.1, famCol(fh, 0.15 + 0.7 * l) * (0.25 + 1.2 * l), 0.45);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    const float R0 = 0.4;
    float r = max(length(p), 1e-3), a = atan(p.y, p.x);
    float z = R0 / r;
    float Y = z + 0.12 * sceneTime + 0.45 * audioAdvance;
    float X = a * R0;
    float fine = 1.0 + 1.5 * clamp(threadP, 0.0, 1.0);
    float la = 0.02 * sceneTime + 0.25 * audioPhase;
    float dX = R0 / (r * resolution.y), dY = R0 / (r * r * resolution.y);
    vec3 silk = famLight(fh, 0.75, 0.25);
    vec3 col = vec3(0.0);
    for (int l = 0; l < 5; ++l) {
        float fl = float(l);
        float turns = floor((6.0 + 5.0 * fl) * fine);                 // whole turns round, so the layer closes
        float sl = 0.25 + 0.3 * fl;                                    // the layer's slant along the tube
        // a thread line: X * turns / (2 pi R0) + Y * slant, with a whole number of threads round
        float u = X * turns / (6.2831853 * R0) + Y * sl * turns * 0.5 * (mod(fl, 2.0) < 0.5 ? 1.0 : -1.0);
        u += 0.3 * sin(Y * 1.3 + fl * 2.0);
        float g = length(vec2(turns / (6.2831853 * R0) * dX, sl * turns * 0.5 * dY));
        float e = 0.5 - abs(fract(u) - 0.5);
        float thread = exp(-pow(e / (g + 0.06), 2.0));
        float detail = 1.0 - smoothstep(0.15, 0.45, g);
        float sheen = pow(abs(sin(atan(sl) - (a - la) * 0.5)), 6.0) * (0.4 + 1.2 * clamp(glossP, 0.0, 1.0));
        col += silk * mix(0.2, thread, detail) * (0.12 + 0.35 * sheen) * (1.0 - 0.12 * fl);
    }
    float thick = fbm(vec2(cos(a), sin(a)) * 2.0 + vec2(0.0, Y * 0.5));
    vec3 light = tone(imgLod(vec2(0.5 + 0.3 * cos(a - la), 0.5 + 0.3 * sin(a - la)), 4.5), fh);
    float breathe = 0.5 + 0.7 * clamp(audioSwell, 0.0, 1.0);
    col += light * smoothstep(0.35, 0.75, thick) * 0.45 * breathe;
    col *= 0.6 + 0.5 * breathe;
    col = mix(col, silk * 0.25 * breathe, smoothstep(5.0, 16.0, z));
    col += silk * exp(-r * 8.0) * 0.3 * breathe;
    finish(col);
}
