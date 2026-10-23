//@doc
 * @brief SPHERICAL WAVE CROSS STITCH: two groups of spherical waves that overlap to make a lattice, with the photo's colours on the crossings; the sources wander.  Four point sources in each of two groups; the cosines of the phases of each group are summed and multiplied, and the nodal grid of the two products
 * shows up as cross stitches in the photo's colours.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the distance between the groups of sources follows the key (integrated)
 *   audioAdvance     -> the sources wander and the waves run (integrated)
 *
 * Knobs: sizeP (the wavelength), hueP.
//@params sizeP
//@audio audioAdvance audioHarmAdvance
//@body
void main()
{
    vec2 p = screenP();
    float k = 6.2831853 / (0.025 + 0.04 * clamp(sizeP, 0.0, 1.0));
    float t = 0.03 * audioAdvance + 0.05 * sceneTime;
    float sep = 0.3 + 0.12 * sin(0.04 * audioHarmAdvance + 0.015 * sceneTime);
    float s1 = 0.0;
    float s2 = 0.0;
    for (int i = 0; i < 4; ++i) {
        float fi = float(i);
        vec2 a = sep * vec2(-1.0, 0.0) + 0.25 * vec2(cos(t * (0.5 + 0.2 * fi) + 1.6 * fi), sin(t * (0.6 + 0.2 * fi) + 2.1 * fi));
        vec2 b = sep * vec2(1.0, 0.0) + 0.25 * vec2(cos(t * (0.55 + 0.2 * fi) + 2.9 * fi), sin(t * (0.45 + 0.2 * fi) + 0.7 * fi));
        s1 += cos(k * length(p - a) - 6.2831853 * t * 2.0 * 0.0);
        s2 += cos(k * length(p - b));
    }
    float g1 = abs(s1) * 0.25;
    float g2 = abs(s2) * 0.25;
    float st = smoothstep(0.55, 0.9, g1) * smoothstep(0.55, 0.9, g2);
    float lines = smoothstep(0.7, 0.95, max(g1, g2));
    vec3 c = imgLod(p * 0.85 + 0.5, 0.8);
    c = mix(vec3(luma(c)), c, 1.4);
    vec3 col = c * (0.2 + 0.7 * lines + 1.6 * st) + vec3(0.02);
    finish(col);
}
