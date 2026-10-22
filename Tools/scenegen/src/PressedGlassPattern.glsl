//@doc
 * @brief PRESSED GLASS PATTERN: a sheet of pressed glass held against the light: its pressed facets -- diamond points,
 * thumbprints or star cuts -- bend the photo behind into a sparkling repeat of small pieces, and every facet flashes
 * when the wandering light finds the angle that sends it to the eye.  Each facet is a small tilted plane; the photo
 * behind is looked up displaced by its slope, and a highlight lights where the slope sends the light straight through.
 * The pattern changes with the sections.  The photo's colours, calmed toward one colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance       -> the light wanders behind the glass (integrated): the sparkle moves over the facets
 *   audioSectionId/Age -> every new section presses another pattern (cross-faded over six seconds)
 *   audioKick          -> the sparkle flares
 *
 * Knobs: cellP (the facets' size), bendP (how far the facets bend the picture), hueP.
//@params cellP bendP
//@audio audioSectionId audioSectionPrev audioSectionAge audioKick
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

/**  The pressed glass' surface height at a place.
 *
 * @param p     The place (in pattern cells). (in)
 * @param kind  0 diamond points, 1 thumbprints, 2 star cuts. (in)
 *
 * @return
 *   The height.
 **/
float surf(vec2 p, float kind)
{
    if (kind < 0.5) {
        vec2 q = fract(rot2(0.7853982) * p) - 0.5;
        return 0.5 - max(abs(q.x), abs(q.y));
    }
    if (kind < 1.5) {
        const vec2 R = vec2(1.0, 1.7320508);
        vec2 a = mod(p, R) - 0.5 * R, b = mod(p - 0.5 * R, R) - 0.5 * R;
        vec2 q = dot(a, a) < dot(b, b) ? a : b;
        return dot(q, q);
    }
    vec2 q = fract(p) - 0.5;
    float r = length(q), an = atan(q.y, q.x);
    return 0.5 - r * (0.8 + 0.25 * abs(cos(4.0 * an)));
}

/**  The sheet seen through one pattern: the bent photo and the facets' sparkle.
 *
 * @param p       The place on screen. (in)
 * @param S       The facets' size. (in)
 * @param kind    The pattern. (in)
 * @param bend    How far the slope moves the picture. (in)
 * @param Lp      The light's place behind the sheet. (in)
 * @param flare   The sparkle's strength. (in)
 * @param fh      The colour family's hue. (in)
 *
 * @return
 *   The colour.
 **/
vec3 sheet(vec2 p, float S, float kind, float bend, vec2 Lp, float flare, float fh)
{
    vec2 q = p / S;
    const float e = 0.01;
    float h0 = surf(q, kind);
    vec2 gr = vec2(surf(q + vec2(e, 0.0), kind) - h0, surf(q + vec2(0.0, e), kind) - h0) / e;
    vec3 n = normalize(vec3(-gr * 0.8, 1.0));
    vec3 c = tone(imgLod((p + gr * bend) * 0.6 + 0.5, 0.8), fh) * (0.45 + 0.6 * max(dot(n, normalize(vec3(-0.35, 0.45, 1.0))), 0.0));
    vec3 ld = normalize(vec3(Lp - p, 0.6));
    float spec = pow(max(dot(n, normalize(ld + vec3(0.0, 0.0, 1.0))), 0.0), 90.0);
    return c + famLight(fh, 0.6, 0.85) * spec * flare;
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float S = 0.08 + 0.06 * clamp(cellP, 0.0, 1.0);
    float bend = 0.03 + 0.04 * clamp(bendP, 0.0, 1.0);
    float m = smoothstep(0.0, 6.0, audioSectionAge);
    float kA = mod(max(audioSectionPrev, 0.0), 3.0), kB = mod(max(audioSectionId, 0.0), 3.0);
    float run = 0.03 * sceneTime + 0.12 * audioAdvance;
    vec2 Lp = vec2(0.7 * sin(run * 1.1), 0.35 * cos(run * 0.8));
    float flare = 1.2 + 1.5 * clamp(audioKick, 0.0, 1.0);
    vec3 col = (1.0 - m) * sheet(p, S, kA, bend, Lp, flare, fh) + m * sheet(p, S, kB, bend, Lp, flare, fh);
    finish(col);
}
