//@doc
 * @brief BEAM PRISM FACETS: a projected pattern -- a gobo of the photo, folded into a rosette -- multiplied by an
 * effect prism in front of the spotlight: three, five or six copies of the round projection lie round the centre,
 * overlapping, each turning against the others, their light adding where they meet.  Each facet shifts the image
 * outward and turns it by its own angle; the copies are round soft-edged discs, as a spotlight's beam is.  The
 * light is the photo's tones, calmed toward one colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSectionId/Age -> every new section changes the prism's facet count (3, 5, 6), over six seconds
 *   audioAdvance       -> the prism turns the copies round the centre and against each other (integrated)
 *   audioSwell         -> the spotlight's brightness
 *
 * Knobs: spreadP (how far the copies lie from the centre), goboP (the gobo's symmetry), hueP.
//@params spreadP goboP
//@audio audioSectionId audioSectionPrev audioSectionAge audioSwell
//@body
/**  The facet count of a section.
 *
 * @param s  The section number. (in)
 *
 * @return
 *   3, 5 or 6.
 **/
float facets(float s)
{
    float m = mod(max(s, 0.0), 3.0);
    return m < 0.5 ? 3.0 : m < 1.5 ? 5.0 : 6.0;
}

/**  The light of a prism with n facets.
 *
 * @param p       The point. (in)
 * @param n       The facet count. (in)
 * @param spread  The copies' distance from the centre. (in)
 * @param turn    The prism's turn. (in)
 * @param sides   The gobo's symmetry. (in)
 * @param fh      The colour family. (in)
 *
 * @return
 *   The light.
 **/
vec3 prismLight(vec2 p, float n, float spread, float turn, float sides, float fh)
{
    vec3 col = vec3(0.0);
    for (int i = 0; i < 6; ++i) {
        if (float(i) >= n) break;
        float a = turn + 6.2831853 * float(i) / n;
        vec2 c = spread * vec2(cos(a), sin(a));
        vec2 q = rot2(-2.0 * turn + float(i)) * (p - c) / 0.4;
        float r = length(q);
        float sec = 6.2831853 / sides;
        float ang = abs(mod(atan(q.y, q.x), sec) - 0.5 * sec);
        vec2 k = r * vec2(cos(ang), sin(ang));
        vec3 photo = imgLod(k * 0.7 + vec2(0.5, 0.42), 0.4);
        float l = luma(photo);
        vec3 c3 = mix(photo * 1.2, famCol(fh, 0.15 + 0.7 * l) * (0.4 + 1.1 * l), 0.5);
        col += c3 * smoothstep(1.0, 0.94, r) * smoothstep(0.15, 0.75, l) * 1.3;   // the gobo passes the bright parts
    }
    return col * (1.6 / n);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float spread = 0.3 + 0.2 * clamp(spreadP, 0.0, 1.0);
    float sides = floor(5.0 + 4.0 * clamp(goboP, 0.0, 1.0));
    float turn = 0.04 * sceneTime + 0.2 * audioAdvance;
    float m = smoothstep(0.0, 6.0, audioSectionAge);
    vec3 col = mix(prismLight(p, facets(audioSectionPrev), spread, turn, sides, fh),
                   prismLight(p, facets(audioSectionId), spread, turn, sides, fh), m);
    col *= 0.7 + 0.5 * clamp(audioSwell, 0.0, 1.0);
    finish(famExpose(col, 1.60, 0.70, 0.05, fh));
}
