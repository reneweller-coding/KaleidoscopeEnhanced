//@doc
 * @brief GROUP ORBIT TRACER: a single wandering point and all its images under a symmetry group draw glowing trails --
 * a rosette of comets tracing mirrored curves round the centre -- and with each section the group changes (three-,
 * four-, five-, six- or eight-fold with mirrors), the old figure fading as the new one appears.  For a mirror group
 * the distance from a place to the nearest image of a curve equals the distance between both folded into one mirror
 * sector, so the trail is drawn there once: its last sixty-four positions, joined, fading with age, the head bright.
 * The trails are shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSectionId/Age -> every new section changes the symmetry group (cross-faded over six seconds)
 *   audioAdvance       -> the point wanders (integrated)
 *   audioSwell         -> the trails' glow
 *
 * Knobs: trailP (how long the trails are), sizeP (the figure's size), hueP.
//@params trailP sizeP
//@audio audioSectionId audioSectionPrev audioSectionAge audioSwell
//@body
/**  A place folded into one mirror sector of the dihedral group with n rotations.
 *
 * @param q  The place. (in)
 * @param n  The order of the rotations. (in)
 *
 * @return
 *   The folded place.
 **/
vec2 foldD(vec2 q, float n)
{
    float sec = 6.2831853 / n;
    float a = abs(mod(atan(q.y, q.x), sec) - 0.5 * sec);
    return length(q) * vec2(cos(a), sin(a));
}

/**  The wandering point's place at a time.
 *
 * @param t     The time along its path. (in)
 * @param size  The figure's size. (in)
 *
 * @return
 *   The place.
 **/
vec2 wander(float t, float size)
{
    return size * (vec2(0.55 * sin(1.3 * t + 0.4), 0.42 * sin(1.7 * t)) + 0.15 * vec2(sin(3.1 * t), cos(2.3 * t)));
}

/**  The trail's light at a place, for one group.
 *
 * @param p     The place. (in)
 * @param n     The group's rotation order. (in)
 * @param t0    The point's time now. (in)
 * @param span  The trail's length in time. (in)
 * @param size  The figure's size. (in)
 *
 * @return
 *   The light.
 **/
float trail(vec2 p, float n, float t0, float span, float size)
{
    vec2 q = foldD(p, n);
    float best = 9.0, age = 1.0;
    vec2 prev = foldD(wander(t0, size), n);
    for (int i = 1; i <= 64; ++i) {
        float u = float(i) / 64.0;
        vec2 pt = foldD(wander(t0 - span * u, size), n);
        vec2 ab = pt - prev, ap = q - prev;
        if (dot(ab, ab) < 0.01) {                                     // (a fold may make two samples jump apart)
            float hh = clamp(dot(ap, ab) / max(dot(ab, ab), 1e-8), 0.0, 1.0);
            float d = length(ap - ab * hh);
            if (d < best) { best = d; age = u; }
        }
        prev = pt;
    }
    float head = exp(-dot(q - foldD(wander(t0, size), n), q - foldD(wander(t0, size), n)) / 0.00008);
    return (exp(-pow(best / 0.003, 2.0)) + 0.25 * exp(-best / 0.02)) * (1.0 - 0.75 * age) + head * 1.5;
}

/**  A group from the list.
 *
 * @param k  Which (any whole number; the list repeats). (in)
 *
 * @return
 *   Its rotation order.
 **/
float groupN(float k)
{
    float j = mod(k, 5.0);
    return j < 0.5 ? 3.0 : j < 1.5 ? 4.0 : j < 2.5 ? 5.0 : j < 3.5 ? 6.0 : 8.0;
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float span = 5.0 + 4.0 * clamp(trailP, 0.0, 1.0);
    float size = 0.9 + 0.4 * clamp(sizeP, 0.0, 1.0);
    float m = smoothstep(0.0, 6.0, audioSectionAge);
    float nA = groupN(max(audioSectionPrev, 0.0)), nB = groupN(max(audioSectionId, 0.0));
    float t0 = 0.15 * sceneTime + 0.6 * audioAdvance;
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float l = (1.0 - m) * trail(p, nA, t0, span, size) + m * trail(p, nB, t0, span, size);
    vec3 col = famCol(fh, 0.45) * 0.015 + famLight(fh, 0.5, 0.5) * l * glow;
    finish(famExpose(col, 6.11, 0.90, 0.00, fh));
}
