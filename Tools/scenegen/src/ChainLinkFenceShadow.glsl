//@doc
 * @brief CHAIN LINK FENCE SHADOW: a chain-link fence throws its diamond mesh onto the photo: thin wires that cross at the fence's knots, soft-edged shadows that distort in perspective as the light moves round, the mesh stretched
 * out in the direction of the light.  The mesh is a pattern of two sets of diagonal lines; the light wanders with the phase of the music, the width of the mesh with the spectral spread.  Light is warm, shade cool.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the direction of the light (integrated): the mesh stretches and shifts
 *   audioSpread     -> the width of the mesh
 *
 * Knobs: wireP (the thickness of the wires), hueP.
//@params wireP
//@audio audioSpread
//@body
/**  The photo lit by a warm light and shaded by a soft shadow.
 *
 * @param c    The photo's colour. (in)
 * @param sh   The shadow, 0 lit .. 1 in shade. (in)
 * @param den  How dark the shade is, 0..1. (in)
 *
 * @return
 *   The colour.
 **/
vec3 lightAndShade(vec3 c, float sh, float den)
{
    vec3 lit = c * vec3(1.12, 1.03, 0.88) * 1.1;
    vec3 shade = c * vec3(0.55, 0.66, 0.82) * (1.0 - 0.6 * den);
    return mix(lit, shade, clamp(sh, 0.0, 1.0));
}
void main()
{
    vec2 p = screenP();
    float ph = 0.1 * audioPhase + 0.015 * sceneTime;
    vec2 L = 0.35 * vec2(cos(ph), sin(0.8 * ph + 1.0));
    vec2 q = p * (1.0 + 0.6 * dot(p, L)) + 0.3 * L * (1.0 + length(p));
    float s = 0.11 + 0.08 * clamp(audioSpread, 0.0, 1.0);
    float u = (q.x + q.y) / s, v = (q.x - q.y) / s;
    float wr = 0.05 + 0.07 * clamp(wireP, 0.0, 1.0);
    float soft = 0.02 + 0.03 * length(p);
    float l1 = smoothstep(wr + soft, wr - soft * 0.5, 0.5 - abs(fract(u) - 0.5));
    float l2 = smoothstep(wr + soft, wr - soft * 0.5, 0.5 - abs(fract(v) - 0.5));
    float sh = max(l1, l2);
    vec3 c = imgLod(p * 0.8 + 0.5, 0.7);
    finish(lightAndShade(c, sh, 0.7));
}
