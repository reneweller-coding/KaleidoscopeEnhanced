//@doc
 * @brief PINHOLE LATTICE INVERSIONS: the pinhole camera, multiplied: a lattice of holes, each projecting the photo upside down and small, and the holes wander; where the circles overlap a carpet of upside-down pictures arises.  The lattice turns slowly and its
 * pitch glides.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the lattice turns and wanders (integrated)
 *   audioSwell   -> the size of the circles against the pitch (overlap)
 *
 * Knobs: sizeP (the pitch), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float pitch = 0.16 + 0.16 * clamp(sizeP, 0.0, 1.0);
    pitch *= 0.85 + 0.2 * sin(0.04 * sceneTime);
    float ang = 0.02 * audioAdvance + 0.02 * sceneTime;
    vec2 q = rot2(ang) * p / pitch;
    vec2 ci = floor(q);
    float R = 0.62 + 0.4 * clamp(audioSwell, 0.0, 1.0);
    vec3 sum = vec3(0.0);
    float ws = 0.0;
    for (int dy = -1; dy <= 1; ++dy)
        for (int dx = -1; dx <= 1; ++dx) {
            vec2 cj = ci + vec2(float(dx), float(dy)) + 0.5;
            vec2 off = 0.12 * vec2(sin(0.3 * hash21(cj) * 20.0 + 0.04 * sceneTime), cos(0.3 * hash21(cj + 3.0) * 20.0 + 0.03 * sceneTime));
            vec2 d = q - (cj + off);
            float dl = length(d);
            float w = smoothstep(R, R * 0.8, dl);
            vec2 uv = 0.5 - d / (2.0 * R) * vec2(1.0, 1.0) * 0.95;
            vec3 c = imgLod(uv, 0.6 + 0.0 * dl);
            sum += c * w;
            ws += w;
        }
    vec3 col = sum / max(ws, 0.2);
    finish(col * 1.1 * smoothstep(0.0, 0.35, ws) + 0.0);
}
