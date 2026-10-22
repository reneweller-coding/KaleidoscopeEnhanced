//@doc
 * @brief KALEIDO SPHERE INTERIOR: inside a sphere whose wall is covered with a photo folded by the icosahedron's 120
 * symmetries: the eye floats at the centre and sees the same piece of the photo mirrored into every one of the 120
 * spherical triangles round it, the whole sphere turning slowly while the piece wanders over the photo.  The view
 * direction is folded into the icosahedral chamber (x >= 0, y >= 0 and the plane with normal (-0.809, -0.5,
 * 0.309)), then projected from the chamber's middle onto the photo.  The photo's own colours, calmed toward one
 * colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the sphere turns (integrated) and the piece of the photo wanders
 *   audioSwell   -> the chamber's mirror lines glow
 *
 * Knobs: pieceP (how much of the photo one chamber shows), lineP (the mirror lines' brightness), hueP.  Distinct
 * from KaleidoDome, which is a half sphere with a ring fold.
//@params pieceP lineP
//@audio audioSwell
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

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float sz = 0.6 + 0.8 * clamp(pieceP, 0.0, 1.0);
    float lines = (0.2 + 0.6 * clamp(lineP, 0.0, 1.0)) * (0.6 + 0.8 * clamp(audioSwell, 0.0, 1.0));
    float turn = 0.03 * sceneTime + 0.12 * audioAdvance;
    vec3 fw = normalize(vec3(0.3 * sin(0.02 * sceneTime), 0.2 * cos(0.017 * sceneTime), 1.0));
    vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
    vec3 up = cross(rt, fw);
    vec3 d = normalize(fw * 0.85 + rt * p.x + up * p.y);
    d.xz = rot2(turn) * d.xz;
    d.xy = rot2(0.6 * turn) * d.xy;
    // fold into the icosahedral chamber, measuring the distance to its walls
    const vec3 r2 = vec3(-0.809017, -0.5, 0.309017);
    for (int k = 0; k < 8; ++k) {
        d.xy = abs(d.xy);
        d -= 2.0 * min(dot(d, r2), 0.0) * r2;
    }
    float e = min(min(d.x, d.y), dot(d, r2));
    // projected from the chamber's middle onto the photo; the piece wanders
    vec3 mid = normalize(vec3(0.15, 0.2, 1.0));
    vec3 u1 = normalize(cross(mid, vec3(0.0, 1.0, 0.0))), u2 = cross(mid, u1);
    vec2 q = vec2(dot(d, u1), dot(d, u2)) / max(dot(d, mid), 0.3);
    vec2 uv = q / (0.25 * sz) * 0.5 + 0.5 + 0.2 * vec2(sin(0.4 * turn), cos(0.3 * turn));
    vec3 col = tone(imgLod(uv, 0.7), fh);
    col *= smoothstep(0.0, 0.006, e);
    col += famLight(fh, 0.6, 0.5) * exp(-e / 0.003) * lines;
    finish(col);
}
