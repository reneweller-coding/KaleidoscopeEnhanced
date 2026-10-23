//@doc
 * @brief MORTON Z ORDER SHUFFLE: the pixels are numbered along the Z curve (interleaved bits of x and y) and shifted along that numbering: the photo falls apart into self-similar squares that wander steadily with the order of the bits.  Only the low bits are shifted,
 * and how many of them glides, so the squares grow from tiny to huge and back.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the number of shifted bits glides (integrated)
 *   audioAdvance     -> the shift along the curve (integrated)
 *
 * Knobs: sizeP (the grid fineness), hueP.
//@params sizeP
//@audio audioAdvance audioHarmAdvance
//@body
/**  The bits of x spread to the even places (Morton code).
 *
 * @param x  The number. (in)
 *
 * @return
 *   The spread bits.
 **/
uint part1by1(uint x)
{
    x &= 0x0000ffffu;
    x = (x | (x << 8)) & 0x00FF00FFu;
    x = (x | (x << 4)) & 0x0F0F0F0Fu;
    x = (x | (x << 2)) & 0x33333333u;
    x = (x | (x << 1)) & 0x55555555u;
    return x;
}
/**  The even bits gathered (the inverse of part1by1).
 *
 * @param x  The Morton code. (in)
 *
 * @return
 *   The gathered bits.
 **/
uint compact1by1(uint x)
{
    x &= 0x55555555u;
    x = (x ^ (x >> 1)) & 0x33333333u;
    x = (x ^ (x >> 2)) & 0x0f0f0f0fu;
    x = (x ^ (x >> 4)) & 0x00ff00ffu;
    x = (x ^ (x >> 8)) & 0x0000ffffu;
    return x;
}
/**  The photo read at the cell reached by shifting the low bits of the Z-order index.
 *
 * @param q  The point. (in)
 * @param G  The grid size. (in)
 * @param nb  The number of shifted low bits. (in)
 * @param s  The shift along the curve. (in)
 *
 * @return
 *   The colour.
 **/
vec3 zShift(vec2 q, float G, uint nb, uint s)
{
    uvec2 ij = uvec2(clamp(floor(q * G), vec2(0.0), vec2(G - 1.0)));
    uint m = part1by1(ij.x) | (part1by1(ij.y) << 1);
    uint low = (1u << nb) - 1u;
    uint m2 = (m & ~low) | ((m + s) & low);
    vec2 r = vec2(float(compact1by1(m2)), float(compact1by1(m2 >> 1))) + 0.5;
    return imgLod((r / G - 0.5) * vec2(resolution.x / resolution.y, 1.0) * 0.85 + 0.5, 1.5 + log2(128.0 / G));
}
void main()
{
    vec2 q = gl_FragCoord.xy / resolution;
    float G = floor(64.0 + 64.0 * clamp(sizeP, 0.0, 1.0));
    G = float(int(G) & ~1);
    float nbf = 2.0 + 8.0 * (0.5 + 0.5 * sin(0.05 * sceneTime + 0.06 * audioHarmAdvance));
    float sf = 0.4 * audioAdvance + 0.8 * sceneTime;
    uint nb0 = uint(floor(nbf));
    float fn = smoothstep(0.0, 1.0, fract(nbf));
    uint s0 = uint(floor(sf));
    float fs = smoothstep(0.0, 1.0, fract(sf));
    vec3 a = mix(zShift(q, G, nb0, s0), zShift(q, G, nb0, s0 + 1u), fs);
    vec3 b = mix(zShift(q, G, nb0 + 1u, s0), zShift(q, G, nb0 + 1u, s0 + 1u), fs);
    finish(mix(a, b, fn) * 1.1);
}
