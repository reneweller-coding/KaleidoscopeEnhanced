//@doc
 * @brief PEARLESCENT FLIP FLOP PAINT: pearlescent paint: a paint that flips from blue to violet to gold with the angle of view; the photo sets the angle, and the flipping wanders.  A gently bumpy surface (noise) and the photo's brightness give the local angle, from which a thin-film palette takes its colour; the flop
 * goes round once with the music's swell.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the flip: the strength of the angle's effect
 *   audioAdvance -> the flipping wanders (integrated)
 *
 * Knobs: sizeP (the scale of the bumps), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float sc = 1.5 + 2.5 * (1.0 - clamp(sizeP, 0.0, 1.0));
    float t = 0.02 * audioAdvance + 0.03 * sceneTime;
    float b = fbm(p * sc + vec2(0.0, t)) + 0.3 * fbm(p * sc * 3.0 + vec2(5.0, -t));
    vec3 c = imgLod(p * 0.85 + 0.5, 1.0);
    float ang = b * 1.6 + luma(c) * 1.2 + 0.4 * sin(t * 2.0);
    float flip = (0.4 + 1.2 * clamp(audioSwell, 0.0, 1.0));
    float x = ang * flip;
    vec3 film = 0.5 + 0.5 * cos(6.2831853 * (vec3(0.0, 0.33, 0.67) + x * 0.9 + 0.1));
    film = mix(vec3(0.2, 0.25, 0.7), film, 0.9);
    float e = 0.004;
    float bx = fbm((p + vec2(e, 0.0)) * sc + vec2(0.0, t)) - fbm((p - vec2(e, 0.0)) * sc + vec2(0.0, t));
    float by = fbm((p + vec2(0.0, e)) * sc + vec2(0.0, t)) - fbm((p - vec2(0.0, e)) * sc + vec2(0.0, t));
    vec3 n = normalize(vec3(-bx / e * 0.05, -by / e * 0.05, 1.0));
    float spec = pow(max(dot(n, normalize(vec3(-0.4, 0.5, 0.8))), 0.0), 40.0);
    vec3 col = film * (0.4 + 0.5 * dot(n, vec3(0.0, 0.0, 1.0))) * mix(vec3(1.0), c * 1.3, 0.35) + spec * 0.6;
    finish(col * 1.1);
}
