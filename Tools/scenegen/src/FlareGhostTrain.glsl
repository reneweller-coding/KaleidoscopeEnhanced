//@doc
 * @brief FLARE GHOST TRAIN: the brightest places of the photo throw ghost images along a line through the middle of the picture, like the
 * reflections between lenses: each ghost smaller, tinted differently and mirrored.  The line turns slowly and more ghosts fade in
 * as the spectrum widens.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread     -> the number of ghosts (the last one fades in continuously)
 *   audioPhase      -> the line turns (integrated)
 *   audioSwell      -> the ghosts' brightness
 *
 * Knobs: reachP (how far the ghosts reach along the line), hueP.
//@params reachP
//@audio audioSpread audioSwell
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float t = sceneTime * 0.1 + 0.8 * audioPhase;
    vec2 dir = vec2(cos(0.4 + 0.3 * sin(t)), sin(0.4 + 0.3 * sin(t)));
    vec3 col = imgLod(uv, 0.4);
    float nG = 2.0 + 4.0 * clamp(audioSpread, 0.0, 1.0);
    float reach = 0.25 + 0.4 * clamp(reachP, 0.0, 1.0);
    for (int k = 1; k <= 6; ++k) {
        float fk = float(k);
        float w = clamp(nG - fk + 1.0, 0.0, 1.0);
        float s = -(0.9 - 0.12 * fk);
        vec2 q = p * s + dir * reach * (fk - 3.0) * 0.4;
        vec3 g = imgLod(q * 0.8 + 0.5, 0.8);
        float L = luma(g);
        vec3 tint = mix(vec3(1.0), vec3(0.8 + 0.1 * sin(fk), 0.9, 0.8 + 0.1 * cos(fk * 1.7)), 0.5);
        col += g * tint * smoothstep(0.55, 0.95, L) * w * 0.3 * (0.4 + 0.9 * clamp(audioSwell, 0.0, 1.0));
    }
    finish(col * 0.95);
}
