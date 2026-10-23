//@doc
 * @brief NIELLO ENGRAVED LINES: niello: fine engravings are filled with a black silver-sulphide alloy; the photo appears as a tangle of black engravings whose density sets the tone, on a polished silver ground.  Lines of one direction run through the picture, a second set crosses them in the dark places,
 * and the whole turns slowly; the silver gleams in broad soft bands.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the direction of the lines turns (integrated)
 *   audioSwell   -> the density of the engraving
 *
 * Knobs: sizeP (the line spacing), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float ang = 0.3 + 0.012 * audioAdvance + 0.015 * sceneTime;
    vec2 uv = p * 0.85 + 0.5;
    vec3 c = imgLod(uv, 1.0);
    float l = luma(c);
    float dark = clamp(1.0 - l, 0.0, 1.0);
    float sp = 70.0 - 40.0 * clamp(sizeP, 0.0, 1.0);
    float den = 0.7 + 0.8 * clamp(audioSwell, 0.0, 1.0);
    float s1 = dot(p, vec2(cos(ang), sin(ang))) * sp + 1.2 * fbm(p * 4.0);
    float w1 = pow(dark, 1.4) * den * 0.5;
    float line1 = 1.0 - smoothstep(w1 * 0.7, w1 + 0.04, abs(fract(s1) - 0.5) * 2.0 * 0.5 + 0.0);
    float s2 = dot(p, vec2(cos(ang + 1.0), sin(ang + 1.0))) * sp * 0.9 + 1.2 * fbm(p * 4.0 + 3.0);
    float w2 = pow(max(dark - 0.45, 0.0) * 1.8, 1.6) * den * 0.5;
    float line2 = 1.0 - smoothstep(w2 * 0.7, w2 + 0.04, abs(fract(s2) - 0.5) * 2.0 * 0.5);
    float line = max(line1, line2 * step(0.001, w2));
    float sheen = 0.65 + 0.35 * sin(3.0 * p.x + 2.0 * p.y + 0.1 * sceneTime) * sin(2.0 * p.y - 0.07 * sceneTime);
    vec3 silver = vec3(0.82, 0.84, 0.88) * sheen + 0.12 * c;
    vec3 col = mix(silver, vec3(0.03, 0.03, 0.04), line * 0.95);
    finish(col * 1.05);
}
