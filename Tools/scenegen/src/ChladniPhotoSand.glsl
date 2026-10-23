//@doc
 * @brief CHLADNI PHOTO SAND: the pixels of the photo wander to the nodal lines of a Chladni plate and the photo turns into sand
 * figures: near the nodes the picture is gathered from a wide area (the sand piles up), away from them it is thin and dark.
 * The plate's mode glides from one eigenform to the next with the harmony.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the mode (n, m) glides from eigenform to eigenform (integrated, cross-faded)
 *   audioSwell      -> the amplitude: how far the sand gathers
 *
 * Knobs: modeP (the base mode), hueP.
//@params modeP
//@audio audioSwell audioHarmAdvance
//@body
/**  A Chladni plate's eigenform (n, m) at a place.
 *
 * @param q  The place on the plate. (in)
 * @param n  The first mode number. (in)
 * @param m  The second mode number. (in)
 *
 * @return
 *   The plate's displacement.
 **/
float chladni(vec2 q, float n, float m)
{
    return cos(n * 3.14159265 * q.x) * cos(m * 3.14159265 * q.y) - cos(m * 3.14159265 * q.x) * cos(n * 3.14159265 * q.y);
}
void main()
{
    vec2 p = screenP();
    vec2 q = p * vec2(0.5625, 1.0) * 1.1;
    float h = audioHarmAdvance + 4.0 * clamp(modeP, 0.0, 1.0);
    float f = floor(h);
    float w = smoothstep(0.55, 1.0, fract(h));
    float n1 = 2.0 + mod(f, 4.0), m1 = 3.0 + mod(f * 2.0, 4.0);
    float n2 = 2.0 + mod(f + 1.0, 4.0), m2 = 3.0 + mod(f * 2.0 + 2.0, 4.0);
    float e = 0.01;
    float u = mix(chladni(q, n1, m1), chladni(q, n2, m2), w);
    vec2 g = vec2(mix(chladni(q + vec2(e, 0.0), n1, m1), chladni(q + vec2(e, 0.0), n2, m2), w) - u,
                  mix(chladni(q + vec2(0.0, e), n1, m1), chladni(q + vec2(0.0, e), n2, m2), w) - u) / e;
    float A = 0.01 + 0.05 * clamp(audioSwell, 0.0, 1.0);
    vec2 uv = p * 0.8 + 0.5 + A * u * g / (dot(g, g) + 0.5) * 6.0;
    float sand = exp(-u * u * 6.0);
    vec3 col = imgLod(uv, 0.5) * (0.22 + 1.0 * sand);
    finish(col);
}
