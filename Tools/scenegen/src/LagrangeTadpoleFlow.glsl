//@doc
 * @brief LAGRANGE TADPOLE FLOW: Lagrange points: particles that run on tadpole orbits round L4 and L5; the picture shows streaming bands of the photo that circle two points in loops and slowly flow away from there.  The photo is turned round each point by an angle that falls with the distance, the stream
 * lines are the level lines of a stream function with two wells, and a gentle drift carries the photo off.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the width of the loops
 *   audioAdvance -> the circling runs (integrated)
 *
 * Knobs: sizeP (the size of the wells), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    float Rw = 0.28 + 0.12 * clamp(sizeP, 0.0, 1.0) + 0.06 * clamp(audioSwell, 0.0, 1.0);
    vec2 L4 = vec2(-0.45 * asp * 0.5 - 0.05, 0.18);
    vec2 L5 = vec2(0.45 * asp * 0.5 + 0.05, -0.18);
    float t = 0.03 * audioAdvance + 0.05 * sceneTime;
    vec2 q = p;
    float psi = 0.0;
    float best = 1e3;
    for (int k = 0; k < 2; ++k) {
        vec2 L = k == 0 ? L4 : L5;
        vec2 d = p - L;
        float r = length(d);
        float w = exp(-r * r / (Rw * Rw));
        float om = (k == 0 ? 1.0 : -1.0) * t * 6.0 / (r / Rw + 0.4);
        vec2 dr = rot2(om * w) * d;
        q = mix(q, L + dr, w);
        float ell = length(d * vec2(1.0, 1.7)) / Rw;
        psi += w * ell * ell;
        best = min(best, ell);
    }
    q += 0.02 * vec2(sin(0.3 * t + p.y * 2.0), cos(0.27 * t + p.x * 2.0));
    vec3 c = imgLod(q * 0.85 + 0.5, 0.6);
    float lines = 0.5 + 0.5 * sin(6.2831853 * (psi * 3.0 - 0.3 * t));
    vec3 col = c * (0.85 + 0.25 * smoothstep(0.4, 0.9, lines) * smoothstep(1.6, 0.4, best));
    col += vec3(0.9, 0.85, 0.7) * smoothstep(0.9, 1.0, lines) * smoothstep(1.3, 0.3, best) * 0.15;
    vec3 bg = imgLod(p * 0.85 + 0.5, 2.5);
    finish(mix(bg * 0.8, col, 1.0) * 1.1);
}
