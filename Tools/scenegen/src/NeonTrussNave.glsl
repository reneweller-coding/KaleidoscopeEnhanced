//@doc
 * @brief NEON TRUSS NAVE: an octet truss in haze -- the bonds of the face-centred cubic lattice, every node joined
 * to its twelve neighbours -- and only the bars glow; the eye glides down the widest straight channel, along a
 * face diagonal, and the bays open like naves of light.  The distance to the truss is folded into one corner of the
 * cell (the lattice is its own mirror image at every whole and half step), where six bars remain.  The colour is
 * one family from the photo, each bar a shade by the photo seen through it.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSectionId/Age -> every new section turns the view, over eight seconds, onto another of the lattice's
 *                         axes (the face diagonal ahead, a cube edge, a body diagonal up or down)
 *   audioAdvance       -> the glide (integrated)
 *   audioSwell         -> the haze between the bars
 *   audioKick          -> the bars flash (light)
 *
 * Knobs: barP (the bars' thickness), hazeP (the haze), hueP.  The low-rated lattice scenes light their bars from
 * outside; here the bars are the light.
//@params barP hazeP
//@audio audioSectionId audioSectionPrev audioSectionAge audioSwell audioKick
//@body
/**  The distance to a bar between two nodes.
 *
 * @param x  The point. (in)
 * @param a  One end. (in)
 * @param b  The other end. (in)
 *
 * @return
 *   The distance.
 **/
float barDist(vec3 x, vec3 a, vec3 b)
{
    vec3 ab = b - a;
    float s = clamp(dot(x - a, ab) / dot(ab, ab), 0.0, 1.0);
    return length(x - a - ab * s);
}

/**  The octet truss' distance in cell units: fold into the corner [0, 0.5]^3 and measure the six bars there.
 *
 * @param x  The point (cell units). (in)
 *
 * @return
 *   The distance to the nearest bar's axis.
 **/
float trussDist(vec3 x)
{
    vec3 u = fract(x);
    vec3 q = min(u, 1.0 - u);
    const vec3 A = vec3(0.5, 0.5, 0.0), B = vec3(0.5, 0.0, 0.5), C = vec3(0.0, 0.5, 0.5);
    float d = min(barDist(q, vec3(0.0), A), min(barDist(q, vec3(0.0), B), barDist(q, vec3(0.0), C)));
    return min(d, min(barDist(q, A, B), min(barDist(q, B, C), barDist(q, C, A))));
}

/**  The view axis a section looks along: the face diagonal ahead, a cube edge, the body diagonals.
 *
 * @param id  The section's number. (in)
 *
 * @return
 *   The unit axis.
 **/
vec3 sectionAxis(float id)
{
    float m = mod(max(id, 0.0), 5.0);
    return m < 0.5 ? vec3(0.7071, 0.7071, 0.0) : m < 1.5 ? vec3(1.0, 0.0, 0.0) : m < 2.5 ? vec3(0.5774, 0.5774, 0.5774)
         : m < 3.5 ? vec3(0.0, 1.0, 0.0) : vec3(0.5774, 0.5774, -0.5774);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    const float S = 5.0;                                         // the cell's size
    float glide = 0.3 * sceneTime + 1.4 * audioAdvance;
    vec3 ro = S * vec3(0.5, 0.0, 0.175) + glide * vec3(0.7071, 0.7071, 0.0);
    float turn = smoothstep(0.0, 8.0, audioSectionAge);
    vec3 fw = normalize(mix(sectionAxis(audioSectionPrev), sectionAxis(audioSectionId), turn)
                        + 0.12 * vec3(sin(0.03 * sceneTime), cos(0.025 * sceneTime), 0.5 * sin(0.02 * sceneTime)));
    vec3 rt = normalize(cross(fw, vec3(0.0, 0.0, 1.0)));
    vec3 up = cross(rt, fw);
    vec3 rd = normalize(fw * 1.1 + rt * p.x + up * p.y);
    float bar = S * (0.012 + 0.012 * clamp(barP, 0.0, 1.0));
    float haze = (0.25 + 0.5 * clamp(hazeP, 0.0, 1.0)) * (0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0));
    float flash = 1.0 + 0.8 * clamp(audioKick, 0.0, 1.0);
    vec3 col = vec3(0.0);
    float t = 0.05, glowSum = 0.0;
    for (int i = 0; i < 96; ++i) {
        vec3 x = ro + rd * t;
        float d = S * trussDist(x / S) - bar;
        float g = 1.0 / (1.0 + pow(max(d, 0.0) * 40.0, 2.0));
        vec3 photo = imgLod(x.xy / (4.0 * S), 3.0);
        vec3 c = famLight(fh, 0.2 + 0.6 * luma(photo), 0.35 * g);
        float fade = exp(-0.15 * t) * smoothstep(0.02, 0.4, t);
        col += c * g * fade * flash * 0.12;
        glowSum += g * fade;
        t += max(0.6 * d, 0.03);
        if (t > 45.0) break;
    }
    col += famCol(fh, 0.35) * haze * 0.004 * glowSum;            // the haze: the bars' light scattered
    col += famCol(fh, 0.5) * 0.012;
    finish(col);
}
