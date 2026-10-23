//@doc
 * @brief FISH SCHOOL FLOW FIELD: a school of fish as a flow field: thousands of particles that mirror their neighbours form eddies and currents that carry the photo along.  Seven vortices wander on slow orbits and push the photo round them (the Lamb-Oseen form), and between them thin streaks of fish-like
 * swimmers drift along the flow.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the vortices wander (integrated)
 *   audioSwell   -> the circulation of the vortices (the alignment)
 *
 * Knobs: sizeP (the size of the vortices), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    float rc = 0.08 + 0.12 * clamp(sizeP, 0.0, 1.0);
    float gam = 0.05 + 0.1 * clamp(audioSwell, 0.0, 1.0);
    vec2 q = p;
    float t = 0.03 * audioAdvance + 0.04 * sceneTime;
    for (int k = 0; k < 7; ++k) {
        float fk = float(k);
        vec2 h = hash22(vec2(fk, 2.2));
        vec2 c = vec2(0.8 * asp * 0.5 * sin(0.9 * t * (0.5 + h.x) + 6.28 * h.y), 0.4 * sin(1.1 * t * (0.5 + h.y) + 6.28 * h.x));
        vec2 d = p - c;
        float r2 = dot(d, d) + 1e-4;
        float sgn = h.x > 0.5 ? 1.0 : -1.0;
        float ang = sgn * gam * 8.0 * (1.0 - exp(-r2 / (rc * rc))) / (1.0 + 4.0 * r2 / (rc * rc)) * 0.0 + sgn * gam * 6.0 * exp(-r2 / (rc * rc * 4.0));
        q = c + rot2(ang) * (q - c);
    }
    vec3 col = imgLod(q * 0.85 + 0.5, 0.6);
    vec2 s = rot2(0.5 * sin(0.3 * t)) * q;
    float fish = noise2(vec2(s.x * 6.0 - 3.0 * t, s.y * 90.0)) * noise2(vec2(s.x * 11.0 - 5.0 * t, s.y * 140.0 + 5.0));
    col = col * (0.85 + 0.3 * smoothstep(0.1, 0.4, fish));
    col += vec3(0.7, 0.85, 1.0) * smoothstep(0.35, 0.6, fish) * 0.18;
    finish(col * 1.1);
}
