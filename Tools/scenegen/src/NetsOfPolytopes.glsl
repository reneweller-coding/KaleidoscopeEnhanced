//@doc
 * @brief NETS OF POLYTOPES: a field of cube nets -- six squares in a cross, lying flat -- folding up into cubes and
 * unfolding again, the flaps swinging on their hinges, the last face closing the lid, each net a little out of step
 * with its neighbours.  Seen from straight above; the faces carry the photo, lit by their tilt.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> how far the nets fold (loud passages close the cubes)
 *   audioPhase      -> the field slides (integrated)
 *   audioKick       -> the hinges flash (light)
 *
 * Knobs: sizeP (net size), stepP (how far neighbours are out of step), photoP (photo share), hueP.
//@params sizeP stepP photoP
//@audio audioSwell audioKick
//@body
/**  Where an orthographic ray straight down hits one face of a folding cube net (unit squares), if it does.
 *
 * @param q    The point in the net's frame (the base square is [0,1]^2). (in)
 * @param face The face: 0 base, 1 left, 2 right, 3 front, 4 back, 5 lid (on the back flap). (in)
 * @param ang  The fold angle, 0 (flat) .. pi/2 (closed). (in)
 *
 * @return
 *   The height of the hit (x), the face's local coordinate (yz), and the face's tilt toward the light (w);
 *   x < -1 when the ray misses.
 **/
vec4 netFace(vec2 q, int face, float ang)
{
    if (face == 0) {
        bool in0 = all(greaterThanEqual(q, vec2(0.0))) && all(lessThanEqual(q, vec2(1.0)));
        return in0 ? vec4(0.0, q, 1.0) : vec4(-9.0);
    }
    // a flap hinged on an edge of the base, swung up by ang: its points are hinge + along * e + ofs * (cos, sin), ofs the distance from the hinge
    float ca = cos(ang), sa = sin(ang);
    float ofs, along, z;
    if (face == 1) { ofs = -q.x / max(ca, 1e-3); along = q.y; }       // hinged on x = 0, swings over -x
    else if (face == 2) { ofs = (q.x - 1.0) / max(ca, 1e-3); along = q.y; }
    else if (face == 3) { ofs = -q.y / max(ca, 1e-3); along = q.x; }
    else if (face == 4) { ofs = (q.y - 1.0) / max(ca, 1e-3); along = q.x; }
    else {
        // the lid: hinged on the far edge of the back flap, swung a further ang
        vec2 hinge = vec2(0.0, 1.0 + ca);                       // the back flap's far edge, projected
        float c2 = cos(2.0 * ang);
        ofs = (q.y - hinge.y) / (abs(c2) > 1e-3 ? c2 : 1e-3);
        along = q.x;
        if (ofs < 0.0 || ofs > 1.0 || along < 0.0 || along > 1.0) return vec4(-9.0);
        z = sa + ofs * sin(2.0 * ang);
        return vec4(z, along, ofs, abs(c2));
    }
    if (ofs < 0.0 || ofs > 1.0 || along < 0.0 || along > 1.0) return vec4(-9.0);
    z = ofs * sa;
    return vec4(z, along, ofs, ca);
}

void main()
{
    vec2 p = screenP();
    float sz = 0.1 + 0.07 * clamp(sizeP, 0.0, 1.0);
    vec2 x = p / sz + vec2(0.3, 0.2) * (0.05 * audioPhase + 0.1 * sceneTime);
    vec2 cell = vec2(4.0, 4.0);
    vec2 id = floor(x / cell);
    vec2 q = x - id * cell - vec2(1.5, 1.2);                    // the net's base square near the cell's middle
    float off = (0.2 + 0.8 * clamp(stepP, 0.0, 1.0)) * hash21(id);
    float fold = clamp((0.5 + 0.5 * sin(0.4 * sceneTime + 6.2831853 * off)) * (0.4 + 0.8 * clamp(audioSwell, 0.0, 1.0)), 0.0, 1.0);
    float ang = fold * 1.5707963;
    vec4 best = vec4(-9.0);
    int bf = -1;
    for (int f = 0; f < 6; ++f) {
        vec4 hgt = netFace(q, f, ang);
        if (hgt.x > best.x) { best = hgt; bf = f; }
    }
    vec3 col;
    if (bf < 0) {
        col = imgLod(p * 0.6 + 0.5, 1.5) * 0.3;                   // the table under the nets
    } else {
        float hh = hash21(id + float(bf) * 0.17);
        vec2 uv = best.yz * 0.25 + vec2(hh, fract(hh * 4.3)) * 0.6 + 0.1;
        vec3 photo = imgLod(uv, 0.4);
        vec3 tone = imgPalette(float(bf) / 6.0 + 0.03 * audioPhase);
        float light = 0.45 + 0.55 * best.w;
        col = mix(tone * 1.1, photo * 1.2, 0.4 + 0.5 * clamp(photoP, 0.0, 1.0)) * light;
        float e = min(min(best.y, 1.0 - best.y), min(best.z, 1.0 - best.z));
        col += mix(tone, vec3(1.0), 0.6) * (1.0 - smoothstep(0.0, 0.05, e)) * 0.3 * (0.4 + clamp(audioKick, 0.0, 1.0));
    }
    finish(col);
}
