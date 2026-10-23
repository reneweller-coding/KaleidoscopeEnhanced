//@doc
 * @brief PRAXINOSCOPE MIRROR PRISM: the praxinoscope: a ring of mirrors in the middle of a drum shows the pictures of the drum's wall without slits; the photo appears as small, circling mirror images around the centre that flow into one another, and the number
 * of mirrors glides between eight and twelve by two layers that fade into each other.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the fading between eight and twelve mirrors (integrated)
 *   audioAdvance     -> the turn of the drum
 *
 * Knobs: sizeP (the size of the mirror images), hueP.
//@params sizeP
//@audio audioAdvance audioHarmAdvance
//@body
/**  The ring of mirror images of the drum wall for n mirrors.
 *
 * @param p  The point. (in)
 * @param n  The number of mirrors. (in)
 * @param rot  The turn. (in)
 * @param sz  The size of the ring. (in)
 *
 * @return
 *   The colour.
 **/
vec3 prism(vec2 p, float n, float rot, float sz)
{
    float r = length(p);
    float a = atan(p.y, p.x) - rot;
    float wedge = 6.2831853 / n;
    float k = floor(a / wedge);
    float ac = (k + 0.5) * wedge;
    vec2 q = rot2(-(ac + rot)) * p;
    vec2 uv = vec2(q.y / (0.5 * r * wedge + 1e-3) * 0.25, 0.5 - (q.x - 0.28) / sz * 0.5) * 0.9;
    vec2 sh = 0.03 * vec2(cos(k * 1.9), sin(k * 1.9));
    vec3 c = imgLod(uv * 0.9 + 0.5 + sh, 0.6);
    float fk = fract(a / wedge);
    float edge = smoothstep(0.0, 0.04, fk) * (1.0 - smoothstep(0.96, 1.0, fk));
    float ring = smoothstep(0.1, 0.14, r) * (1.0 - smoothstep(0.1 + sz, 0.14 + sz, r));
    return c * edge * ring;
}
void main()
{
    vec2 p = screenP();
    float sz = 0.3 + 0.2 * clamp(sizeP, 0.0, 1.0);
    float rot = 0.04 * audioAdvance + 0.03 * sceneTime;
    float m = smoothstep(0.0, 1.0, 0.5 + 0.5 * sin(0.12 * audioHarmAdvance + 0.04 * sceneTime));
    vec3 a = prism(p, 8.0, rot, sz);
    vec3 b = prism(p, 12.0, -0.8 * rot, sz);
    vec3 col = mix(a, b, m);
    vec3 bg = imgLod(p * 0.5 + 0.5, 4.0) * 0.28;
    float r = length(p);
    float disc = smoothstep(0.1 + sz, 0.14 + sz, r);
    col += bg * (0.4 + 0.6 * disc);
    finish(col * 1.3);
}
