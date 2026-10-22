//@doc
 * @brief TEXTURE GOBO BEAMS: spotlights project the photo through haze: cones of coloured light reach across the
 * room, and where they land on the back wall the photo appears in their pools, cut by the gobo's shape; the beams pan
 * with the music's phase, brighten as it swells, and every section changes the gobos.  Four projectors hang above and
 * near the eye, each aimed at a point on the wall that wanders; a place on the wall inside a cone shows the photo as
 * the gobo throws it, and the haze along the ray glows where it crosses a cone (twelve samples per ray), coloured by the
 * photo at that spot of the beam.  A section's gobo -- a round, a star, rings or bars -- is cross-faded over six
 * seconds.  The light is the photo, calmed toward one colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase         -> the beams pan over the wall (integrated)
 *   audioSectionId/Age -> every section changes the gobos (cross-faded over six seconds)
 *   audioSwell         -> the beams' brightness
 *
 * Knobs: coneP (the cones' width), hazeP (how thick the haze is), hueP.
//@params coneP hazeP
//@audio audioPhase audioSectionId audioSectionPrev audioSectionAge audioSwell
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

/**  A gobo's mask at a place in the beam.
 *
 * @param q     The place across the beam (1 at the cone's edge). (in)
 * @param kind  The gobo (0 round, 1 star, 2 rings, 3 bars). (in)
 *
 * @return
 *   How much light passes (0..1).
 **/
float gobo(vec2 q, float kind)
{
    float r = length(q), a = atan(q.y, q.x);
    float edge = 1.0 - smoothstep(0.92, 1.0, r);
    if (kind < 0.5) return edge;
    if (kind < 1.5) return edge * smoothstep(0.0, 0.08, 0.35 + 0.5 * pow(abs(cos(2.5 * a)), 3.0) - r);
    if (kind < 2.5) return edge * smoothstep(0.3, 0.6, 0.5 + 0.5 * cos(r * 20.0));
    return edge * smoothstep(0.2, 0.5, 0.5 + 0.5 * cos(q.x * 14.0));
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    const float F = 1.1, ZW = 6.0;
    float ta = tan(0.2 + 0.12 * clamp(coneP, 0.0, 1.0));            // the cones' half-angle tangent
    float pan = 0.04 * sceneTime + 0.5 * audioPhase;
    float m = smoothstep(0.0, 6.0, audioSectionAge);
    float kA = mod(max(audioSectionPrev, 0.0), 4.0), kB = mod(max(audioSectionId, 0.0), 4.0);
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec3 rd = vec3(p / F, 1.0);                                       // the ray, z = 1 per unit along
    vec3 wall = rd * ZW;
    vec3 col = tone(imgLod(vec2(0.5) + wall.xy * 0.08, 5.0), fh) * 0.04;   // the dark wall
    float haze = 0.05 + 0.08 * clamp(hazeP, 0.0, 1.0);
    for (int k = 0; k < 4; ++k) {
        float fk = float(k);
        vec3 S = vec3(-1.5 + fk, 1.4, 0.6);                           // the projector
        vec2 tgt = vec2(2.6 * sin(pan + 1.7 * fk), 1.4 * sin(0.7 * pan + 2.3 * fk + 1.0) - 0.1);
        vec3 ax = normalize(vec3(tgt, ZW) - S);
        vec3 u = normalize(cross(ax, vec3(0.0, 1.0, 0.0))), v = cross(u, ax);
        // the pool on the wall
        vec3 dw = wall - S;
        float along = dot(dw, ax);
        vec2 q = vec2(dot(dw, u), dot(dw, v)) / (along * ta);
        float mask = (1.0 - m) * gobo(q, kA) + m * gobo(q, kB);
        vec3 img = tone(imgLod(fract(vec2(0.5) + q * 0.35 + vec2(0.23, 0.31) * fk), 1.5), fh);
        col += img * mask * 0.8 * glow * step(0.0, along);
        // the haze where the ray crosses the cone
        for (int s = 0; s < 12; ++s) {
            float t = ZW * (float(s) + 0.5 + 0.5 * hash21(gl_FragCoord.xy + float(s))) / 12.0;
            vec3 x = rd * t - S;
            float al = dot(x, ax);
            if (al <= 0.0) continue;
            vec2 qs = vec2(dot(x, u), dot(x, v)) / (al * ta);
            float ms = (1.0 - m) * gobo(qs, kA) + m * gobo(qs, kB);
            vec3 c = tone(imgLod(fract(vec2(0.5) + qs * 0.35 + vec2(0.23, 0.31) * fk), 3.5), fh);
            col += c * ms * haze * glow / (0.6 + 0.15 * al);
        }
    }
    finish(col);
}
