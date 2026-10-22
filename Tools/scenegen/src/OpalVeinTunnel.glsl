//@doc
 * @brief OPAL VEIN TUNNEL: a tunnel cut through opal: a milky body full of patches of play-of-colour that flash and
 * change as they are seen from new angles, crossed by dark veins; the flashes wander with the music's phase and the
 * veins branch anew with every chord.  The patches are cells of a tiling on the unrolled wall with a whole number
 * around; each flashes with a tone that depends on its own seed, the angle it is seen at and the integrated phase, kept
 * within a narrow span round the photo's colour family; the veins are the ridges of a noise, a chord change
 * cross-fading to another noise.  The body is the photo, calmed toward the family.  Distinct from
 * OpalStructuralColour, which is a surface.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase       -> the play of colour wanders over the patches (integrated)
 *   audioHarmAdvance -> the veins branch anew with every chord change (cross-faded)
 *   audioAdvance     -> the flight (integrated)
 *   audioSwell       -> the flashes' strength
 *
 * Knobs: patchP (the patches' size), veinP (how many veins), hueP.
//@params patchP veinP
//@audio audioPhase audioHarmAdvance audioSwell
//@body
/**  The photo's colour calmed toward the colour family.
 *
 * @param photo  The photo's colour. (in)
 * @param fh     The family's hue. (in)
 *
 * @return
 *   The colour.
 **/
vec3 tone(vec3 photo, float fh)
{
    float l = luma(photo);
    return mix(photo * 1.1, famCol(fh, 0.15 + 0.7 * l) * (0.25 + 1.2 * l), 0.45);
}

/**  The veins: the ridges of a noise on the wound wall (no seam round it).
 *
 * @param a     The angle round. (in)
 * @param Y     The place along. (in)
 * @param seed  The noise's seed. (in)
 *
 * @return
 *   The veins' darkness (0..1).
 **/
float veins(float a, float Y, float seed)
{
    vec2 q = vec2(cos(a), sin(a)) * 1.6 + vec2(0.0, Y * 0.9);
    float n = fbm(q * 1.4 + seed) * 0.65 + 0.35 * fbm(vec2(q.y * 1.1, q.x * 2.3) + seed * 1.7);
    return exp(-pow((n - 0.5) / 0.012, 2.0));
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    const float R0 = 0.4;
    float r = max(length(p), 1e-3), a = atan(p.y, p.x);
    float z = R0 / r;
    float fly = 0.22 * sceneTime + 0.8 * audioAdvance;
    float Y = z + fly;
    float M = floor(30.0 + 24.0 * (1.0 - clamp(patchP, 0.0, 1.0)));
    float cw = 6.2831853 * R0 / M;
    vec2 q = vec2(a / 6.2831853 * M, Y / cw);
    vec2 ip = floor(q);
    float d1 = 9.0;
    vec2 bid = vec2(0.0), bl = vec2(0.0);
    for (int j = -1; j <= 1; ++j)
        for (int i = -1; i <= 1; ++i) {
            vec2 c = ip + vec2(float(i), float(j));
            vec2 id = vec2(mod(c.x, M), c.y);
            vec2 g = c + 0.2 + 0.6 * hash22(id);
            float d = dot(q - g, q - g);
            if (d < d1) { d1 = d; bid = id; bl = q - g; }
        }
    float view = atan(r);
    float play = 0.03 * sceneTime + 0.35 * audioPhase;
    float hs = hash21(bid);
    float flash = pow(0.5 + 0.5 * cos(6.2831853 * (hs + 1.5 * view) + 3.0 * play + 6.0 * hs), 6.0);
    vec3 fcol = famLight(fract(fh + 0.12 * (hash21(bid + 5.0) - 0.5)), 0.3 + 0.5 * hs, 0.7);
    // a flake's own stripes of colour, shifting with the angle (the harlequin look)
    float sa = 6.2831853 * hash21(bid + 9.0);
    flash *= 0.35 + 0.65 * pow(0.5 + 0.5 * cos(dot(bl, vec2(cos(sa), sin(sa))) * 14.0 + 4.0 * view + 2.0 * play), 2.0);
    vec3 body = tone(imgLod(vec2(0.5 + 0.3 * cos(a), 0.5 + 0.3 * sin(a)), 4.0), fh);
    body = mix(body, vec3(luma(body)), 0.6) * 0.2;
    float px = R0 / (r * r * resolution.y) / cw;
    float detail = 1.0 - smoothstep(0.1, 0.3, px);
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec3 col = body + fcol * flash * 1.1 * glow * detail + fcol * 0.15 * (1.0 - detail);
    float h = max(audioHarmAdvance, 0.0), hk = floor(h), m = smoothstep(0.3, 0.7, fract(h));
    float vd = mix(veins(a, Y, mod(hk, 9.0) * 3.7), veins(a, Y, mod(hk + 1.0, 9.0) * 3.7), m);
    col = mix(col, famCol(fh, 0.2) * 0.04, vd * (0.4 + 0.5 * clamp(veinP, 0.0, 1.0)));
    col = mix(col, body * 0.6, smoothstep(6.0, 18.0, z));
    col += famLight(fh, 0.5, 0.6) * exp(-r * 9.0) * 0.3;
    finish(col);
}
