//@doc
 * @brief KIKUCHI BAND PHOTO: Kikuchi bands as in electron diffraction: a net of crossing bright bands running together into poles with star
 * knots, the brightness of the bands modulated by the photo; the crystal tilts so the whole net sweeps over the picture.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the crystal tilts (integrated)
 *   audioSwell      -> the bands' width
 *
 * Knobs: bandP (the base band width), tiltP (how far the crystal tilts), hueP.
//@params bandP tiltP
//@audio audioSwell
//@body
/**  The normal of the nth lattice plane of the crystal (the cube's faces, edges and corners).
 *
 * @param i  The plane, 0..12. (in)
 *
 * @return
 *   The unit normal.
 **/
vec3 kikNormal(int i)
{
    if (i == 0) return vec3(1.0, 0.0, 0.0);
    if (i == 1) return vec3(0.0, 1.0, 0.0);
    if (i == 2) return vec3(0.0, 0.0, 1.0);
    if (i == 3) return vec3(0.7071068, 0.7071068, 0.0);
    if (i == 4) return vec3(0.7071068, -0.7071068, 0.0);
    if (i == 5) return vec3(0.7071068, 0.0, 0.7071068);
    if (i == 6) return vec3(0.7071068, 0.0, -0.7071068);
    if (i == 7) return vec3(0.0, 0.7071068, 0.7071068);
    if (i == 8) return vec3(0.0, 0.7071068, -0.7071068);
    if (i == 9) return vec3(0.5773503, 0.5773503, 0.5773503);
    if (i == 10) return vec3(0.5773503, 0.5773503, -0.5773503);
    if (i == 11) return vec3(0.5773503, -0.5773503, 0.5773503);
    return vec3(-0.5773503, 0.5773503, 0.5773503);
}
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float t = sceneTime * 0.15 + 1.2 * audioPhase;
    float tilt = 0.2 + 0.5 * clamp(tiltP, 0.0, 1.0);
    vec3 v = normalize(vec3(p * 1.4, 1.0));
    float c1 = cos(tilt * sin(t)), s1 = sin(tilt * sin(t));
    float c2 = cos(0.5 * t), s2 = sin(0.5 * t);
    float w = 0.02 + 0.03 * clamp(bandP, 0.0, 1.0) + 0.012 * clamp(audioSwell, 0.0, 1.0);
    float sum = 0.0;
    for (int i = 0; i < 13; ++i) {
        vec3 n = kikNormal(i);
        n.xz = mat2(c1, -s1, s1, c1) * n.xz;
        n.xy = mat2(c2, -s2, s2, c2) * n.xy;
        float d = abs(dot(v, n));
        sum += smoothstep(w, w * 0.55, d) * (0.6 + 0.4 * smoothstep(w * 0.75, w * 0.5, d));
    }
    vec3 c = imgLod(uv, 0.6);
    vec3 col = c * (0.18 + 0.9 * clamp(sum, 0.0, 1.6)) + 0.05 * imgLod(uv, 4.0);
    finish(col);
}
