//@doc
 * @brief CORNER CUBE TUNNEL: looking into the corner where three mirrors meet at right angles: the object hanging in
 * front of the corner is seen eight times -- once directly and in every combination of the three mirrors -- and the
 * images close into a hexagon round the corner's point, which blurs and opens as the eye comes nearer.  Optics: a
 * ray reflected by the planes x = 0, y = 0 or z = 0 has that coordinate's sign flipped, so tracing in the unfolded
 * space (all coordinates folded to their absolute values) and counting the flips gives every image at once.
 * A section takes one mirror away (two mirrors: four images), the next brings it back.  The object is a photo-
 * textured ball in one colour family; every bounce costs a tenth of the light.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance       -> the eye's approach to the corner and back (integrated)
 *   audioSectionId/Age -> every new section takes away or brings back the third mirror (over six seconds)
 *   audioSwell         -> the ball's glow
 *
 * Knobs: ballP (the ball's size), approachP (how close the eye comes), hueP.
//@params ballP approachP
//@audio audioSectionId audioSectionPrev audioSectionAge audioSwell
//@body
/**  The scene in the unfolded space: the ball, the mirrors' faint grid, seen along a ray with the given mirrors.
 *
 * @param ro     The ray's start. (in)
 * @param rd     The ray's direction. (in)
 * @param three  1 with the third mirror (z = 0), 0 without. (in)
 * @param R      The ball's radius. (in)
 * @param fh     The colour family. (in)
 *
 * @return
 *   The light.
 **/
vec3 cornerLight(vec3 ro, vec3 rd, float three, float R, float fh)
{
    vec3 ctr = vec3(0.55, 0.45, 0.5);
    float t = 0.0;
    for (int i = 0; i < 80; ++i) {
        vec3 x = ro + rd * t;
        vec3 f = vec3(abs(x.x), abs(x.y), three > 0.5 ? abs(x.z) : x.z);
        float d = length(f - ctr) - R;
        if (d < 0.002) {
            float flips = step(x.x, 0.0) + step(x.y, 0.0) + (three > 0.5 ? step(x.z, 0.0) : 0.0);
            vec3 n = normalize(f - ctr);
            vec2 uv = vec2(abs(atan(n.z, n.x)) / 3.14159265, n.y * 0.5 + 0.5);   // mirrored round the ball: no seam
            vec3 photo = imgLod(uv, 1.0 + 0.5 * flips);
            float fres = pow(1.0 - abs(dot(n, normalize(rd))), 2.0);
            vec3 c = famCol(fh, 0.15 + 0.7 * luma(photo)) * (0.3 + 1.1 * luma(photo)) + famLight(fh, 0.6, 0.5) * fres * 0.4;
            return c * pow(0.9, flips);
        }
        t += d * 0.9;
        if (t > 12.0) break;
    }
    // past the ball: the dark glass of the room
    return famCol(fh, 0.45) * 0.03;
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float R = 0.3 + 0.12 * clamp(ballP, 0.0, 1.0);
    float swing = 0.5 - 0.5 * cos(0.05 * sceneTime + 0.25 * audioAdvance);
    float dist = mix(2.0, 1.25 - 0.2 * clamp(approachP, 0.0, 1.0), swing);
    float three = mix(mod(max(audioSectionPrev, 0.0) + 1.0, 2.0), mod(max(audioSectionId, 0.0) + 1.0, 2.0),
                      smoothstep(0.0, 6.0, audioSectionAge));
    // the eye on the corner's diagonal, looking into it
    vec3 axis = normalize(vec3(1.0, 1.0, 1.0));
    vec3 ro = axis * dist + 0.1 * vec3(sin(0.04 * sceneTime), cos(0.035 * sceneTime), 0.0);
    vec3 fw = normalize(-ro);
    vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
    vec3 up = cross(rt, fw);
    vec3 rd = normalize(fw * 0.8 + rt * p.x + up * p.y);
    vec3 cA = cornerLight(ro, rd, 0.0, R, fh), cB = cornerLight(ro, rd, 1.0, R, fh);
    vec3 col = mix(cA, cB, three) * (0.9 + 0.5 * clamp(audioSwell, 0.0, 1.0));
    finish(col);
}
