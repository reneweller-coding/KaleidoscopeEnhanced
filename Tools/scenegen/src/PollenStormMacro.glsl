//@doc
 * @brief POLLEN STORM MACRO: pollen grains in a storm of eddies, seen through a macro lens -- round grains covered in
 * spines and pits, tumbling through the air in swirls; the ones in the plane of focus crisp and detailed, the ones
 * nearer and farther melting into soft discs of light.  Three layers at different depths stream at different speeds,
 * curling round the eddies; the photo colours the grains.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the eddies turn (integrated)
 *   audioAdvance    -> the storm streams (integrated: the music's drive)
 *   audioKick       -> the grains' spines glint (light)
 *
 * Knobs: grainsP (how many grains), spinesP (how spiny), photoP (photo share), hueP.
//@params grainsP spinesP photoP
//@audio audioKick
//@body
void main()
{
    vec2 p = screenP();
    vec3 tone = imgPalette(0.15 + 0.03 * audioPhase);
    vec3 col = imgLod(p * 0.3 + 0.5, 5.0) * 0.25 + tone * 0.06;
    float S0 = 0.16 - 0.06 * clamp(grainsP, 0.0, 1.0);
    for (int layer = 0; layer < 3; ++layer) {
        float fl = float(layer);
        float S = S0 * (0.6 + 0.4 * fl);                        // far small .. near large
        float blur = layer == 1 ? 0.0 : (layer == 0 ? 0.5 : 0.8);   // the middle layer is in focus
        float speed = 0.04 + 0.04 * fl;
        vec2 flowOff = vec2(speed * (sceneTime + 2.0 * audioAdvance), 0.0);
        // swirl: rotate the frame round eddies (a smooth warp that turns with the phase)
        vec2 w = vec2(noise2(p * 2.0 + vec2(0.0, 0.02 * audioPhase) + fl * 3.0), noise2(p * 2.0 + vec2(4.0, -0.02 * audioPhase) + fl * 3.0)) - 0.5;
        vec2 q = p + flowOff + w * 0.15 + fl * vec2(0.37, 0.19);
        vec2 cell = floor(q / S);
        for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
            vec2 cc = cell + vec2(float(i), float(j));
            vec2 h = hash22(cc + fl * 9.1);
            if (h.x < 0.45) continue;
            vec2 c = (cc + 0.5 + 0.6 * (h - 0.5)) * S;
            float R = S * (0.18 + 0.1 * h.y);
            vec2 d = q - c;
            float r = length(d);
            float soft = R * (0.06 + blur * 0.6);
            // the grain's outline: spines all round (sharp only in focus)
            float a = atan(d.y, d.x) + 6.2831853 * h.x + sceneTime * (h.y - 0.5) * 0.6;
            float sp = 1.0 + (0.08 + 0.12 * clamp(spinesP, 0.0, 1.0)) * pow(abs(sin(a * (9.0 + 6.0 * h.y))), 6.0) * (1.0 - blur);
            float edge = smoothstep(R * sp + soft, R * sp - soft, r);
            if (edge < 0.001) continue;
            float z = sqrt(max(1.0 - (r / R) * (r / R), 0.0));
            vec3 photo = imgLod(c * 0.5 + 0.5, 1.5);
            vec3 cg = mix(tone * 1.2, photo * 1.5, 0.5 + 0.45 * clamp(photoP, 0.0, 1.0));
            float pits = 1.0 - 0.25 * (1.0 - blur) * smoothstep(0.2, 0.05, length(fract(d / (R * 0.28) + h * 3.0) - 0.5));
            vec3 g = cg * (0.45 + 0.65 * z) * pits;
            g += mix(cg, vec3(1.0), 0.6) * (sp - 1.0) * 4.0 * (0.3 + 0.7 * clamp(audioKick, 0.0, 1.0)) * (1.0 - blur);
            col = mix(col, g * (layer == 1 ? 1.0 : 0.75), edge * (layer == 2 ? 0.8 : 1.0));
        }
    }
    finish(col * 1.1);
}
