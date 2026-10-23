//@doc
 * @brief STRAW MARQUETRY HERRINGBONE: straw marquetry: split stalks, ironed flat and glued in a herringbone, shimmer as bands; the photo sets colour and direction of every stalk, and the light glides over the bands.  The stalks run diagonally in rows that change direction row by row, every stalk has its
 * own tone from the photo, and a broad highlight moves over them.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the light glides over the bands (integrated)
 *   audioSwell   -> the strength of the sheen
 *
 * Knobs: sizeP (the width of the stalks), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float W = 0.025 + 0.03 * clamp(sizeP, 0.0, 1.0);
    vec2 q = p / W;
    float row = floor(q.y);
    float fy = fract(q.y);
    float sg = mod(row, 2.0) < 0.5 ? 1.0 : -1.0;
    float L = 5.0;
    float s = q.x * sg + q.y * 0.0 + row * 0.5 * sg;
    float k = floor(s / L);
    float fk = fract(s / L);
    vec2 cen = vec2((k + 0.5) * L * sg - row * 0.5, row + 0.5) * W;
    vec3 c = imgLod(cen * 0.85 + 0.5, 1.4);
    float l = luma(c);
    vec3 straw = mix(vec3(0.5, 0.38, 0.16), vec3(1.0, 0.9, 0.55), l);
    straw = mix(straw, straw * (0.7 + c), 0.4);
    float lightx = 0.5 * sin(0.04 * audioAdvance + 0.05 * sceneTime);
    float sheen = pow(0.5 + 0.5 * cos(10.0 * (p.x - lightx) + 6.0 * sg * fy), 4.0);
    float lf = 0.5 + 0.5 * cos(3.0 * (p.x - lightx));
    float gloss = 0.25 + 0.9 * clamp(audioSwell, 0.0, 1.0);
    float joint = smoothstep(0.0, 0.08, fy) * (1.0 - smoothstep(0.92, 1.0, fy)) * smoothstep(0.0, 0.03, fk) * (1.0 - smoothstep(0.97, 1.0, fk));
    vec3 col = straw * (0.65 + 0.35 * lf) + vec3(1.0, 0.95, 0.75) * sheen * gloss * 0.5 * lf;
    finish(col * (0.35 + 0.65 * joint) * 1.1);
}
