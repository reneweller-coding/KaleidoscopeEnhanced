//@doc
 * @brief QAM CONSTELLATION DUST: a constellation diagram: the symbols of a 16, 64 or 256 QAM signal scatter as clouds of dust around their lattice points, and the photo stands there as a pattern of dots from lattice clouds (each cloud carries the colour of the photo at its own place).
 * The number of lattice points glides between two orders, the noise smears the clouds, and the lattice turns slowly.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the order of the lattice glides (integrated)
 *   audioRoughness   -> the scatter of the clouds
 *   audioAdvance     -> the turn of the lattice
 *
 * Knobs: sizeP (the size of the dust), hueP.
//@params sizeP
//@audio audioRoughness audioAdvance audioHarmAdvance
//@body
/**  One order of the constellation: dust clouds round the points of an M x M lattice, coloured by the photo.
 *
 * @param p  The point. (in)
 * @param M  The lattice order. (in)
 * @param rot  The turn. (in)
 * @param sg  The spread of the clouds. (in)
 * @param dust  The size of the dust. (in)
 *
 * @return
 *   The layer's colour.
 **/
vec3 qamLayer(vec2 p, float M, float rot, float sg, float dust)
{
    vec2 q = rot2(rot) * p * M / 0.95 + 0.5 * M;
    vec2 ci = floor(q);
    vec2 d = q - (ci + 0.5);
    float cloud = exp(-dot(d, d) / (2.0 * sg * sg));
    vec2 pcen = rot2(-rot) * ((ci + 0.5 - 0.5 * M) * 0.95 / M);
    vec3 c = imgLod(pcen * 0.85 + 0.5, 1.5 + log2(M / 8.0) * -0.5 + 1.0);
    vec2 g = floor(q * 28.0 / dust);
    float h = hash21(g);
    float on = smoothstep(h - 0.15, h + 0.15, cloud * 1.1);
    return c * on * (0.5 + 0.7 * cloud);
}
void main()
{
    vec2 p = screenP();
    float rot = 0.03 * audioAdvance + 0.02 * sceneTime;
    float e = 0.5 + 0.5 * sin(0.07 * audioHarmAdvance + 0.03 * sceneTime);
    float sg = 0.14 + 0.2 * clamp(audioRoughness, 0.0, 1.0);
    float dust = 0.8 + 1.6 * clamp(sizeP, 0.0, 1.0);
    float M0 = 8.0;
    float M1 = 16.0;
    vec3 a = qamLayer(p, M0, rot, sg, dust);
    vec3 b = qamLayer(p, M1, rot, sg * 1.3, dust);
    vec3 col = mix(a, b, smoothstep(0.2, 0.8, e)) * 1.6;
    col += imgLod(p * 0.85 + 0.5, 2.5) * 0.06;
    finish(col);
}
