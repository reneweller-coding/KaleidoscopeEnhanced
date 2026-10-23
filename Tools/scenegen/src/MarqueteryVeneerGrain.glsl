//@doc
 * @brief MARQUETRY VENEER GRAIN: marquetry: the photo is cut into pieces of veneer, each with a grain of its own that comes from the photo's colours as wood tones; the pieces fit together like a jigsaw, and the grain flows across the joints.  Each piece takes its tone from the photo at its centre; the
 * grain is a stretched wave field that runs through all the pieces.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the grain runs on and the pieces' corners wander (integrated)
 *   audioSwell   -> the contrast of the grain
 *
 * Knobs: sizeP (the size of the pieces), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float S = 0.13 + 0.12 * clamp(sizeP, 0.0, 1.0);
    vec2 g = p / S;
    vec2 gi = floor(g);
    float d1 = 1e3;
    float d2 = 1e3;
    vec2 best = vec2(0.0);
    for (int dy = -1; dy <= 1; ++dy)
        for (int dx = -1; dx <= 1; ++dx) {
            vec2 cj = gi + vec2(float(dx), float(dy));
            vec2 h = hash22(cj);
            vec2 pt = cj + 0.5 + 0.4 * vec2(sin(6.2831853 * h.x + 0.05 * audioAdvance + 0.04 * sceneTime), cos(6.2831853 * h.y + 0.04 * audioAdvance));
            float d = length(g - pt);
            if (d < d1) { d2 = d1; d1 = d; best = pt; } else if (d < d2) d2 = d;
        }
    vec3 c = imgLod(best * S * 0.85 + 0.5, 2.2);
    float l = luma(c);
    vec3 wood = mix(vec3(0.16, 0.08, 0.04), vec3(0.86, 0.62, 0.34), clamp(l * 1.1, 0.0, 1.0));
    wood = mix(wood, wood * (0.75 + c), 0.45);
    float ang = 0.35 + 0.4 * sin(0.3 * best.x + 0.2 * best.y);
    float gp = dot(p, vec2(cos(ang), sin(ang))) * 90.0 + 5.0 * fbm(p * 3.0 + 0.01 * audioAdvance) + 1.5 * hash21(floor(best));
    float grain = 0.5 + 0.5 * sin(gp);
    float cont = 0.2 + 0.5 * clamp(audioSwell, 0.0, 1.0);
    vec3 col = wood * (1.0 - cont + cont * 1.6 * grain);
    float joint = smoothstep(0.0, 0.03, d2 - d1);
    finish(col * (0.35 + 0.65 * joint) * 1.2);
}
