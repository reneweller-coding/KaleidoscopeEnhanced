//@doc
 * @brief DICHROIC CUBE CLUSTER: cubes of dichroic glass floating in depth, turning: each reflects one shade and lets
 * the neighbouring shade through, depending on the angle at which the light meets it -- so every face changes its
 * colour as the cube turns, and the light behind (the photo) shines through in the other shade.  Optics: a thin-film
 * stack whose reflected band moves toward the short end as the angle grows; here the band is a shade of the colour
 * family that slides with the cosine of the incidence, the transmitted light the family's neighbouring shade.  The
 * eye drifts through the cluster.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the cubes turn (integrated) and the eye drifts
 *   audioSwell   -> the light behind the cubes grows
 *   audioKick    -> the cubes' edges flash (light)
 *
 * Knobs: densityP (how many cubes), sizeP (the cubes' size), hueP.  Distinct from DichroicInfinityPrismVault, which
 * is a room.
//@params densityP sizeP
//@audio audioSwell audioKick
//@body
/**  A rotation about an axis.
 *
 * @param ax  The unit axis. (in)
 * @param a   The angle. (in)
 *
 * @return
 *   The rotation matrix.
 **/
mat3 axisRotD(vec3 ax, float a)
{
    float c = cos(a), s = sin(a);
    return mat3(c + ax.x * ax.x * (1.0 - c), ax.y * ax.x * (1.0 - c) + ax.z * s, ax.z * ax.x * (1.0 - c) - ax.y * s,
                ax.x * ax.y * (1.0 - c) - ax.z * s, c + ax.y * ax.y * (1.0 - c), ax.z * ax.y * (1.0 - c) + ax.x * s,
                ax.x * ax.z * (1.0 - c) + ax.y * s, ax.y * ax.z * (1.0 - c) - ax.x * s, c + ax.z * ax.z * (1.0 - c));
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    const float CELL = 2.6;
    float present = 0.35 + 0.5 * clamp(densityP, 0.0, 1.0);
    float half_ = 0.32 + 0.22 * clamp(sizeP, 0.0, 1.0);
    float spin = 0.06 * sceneTime + 0.3 * audioAdvance;
    float drift = 0.25 * sceneTime + 1.0 * audioAdvance;
    float back = 0.6 + 0.7 * clamp(audioSwell, 0.0, 1.0);
    float kick = clamp(audioKick, 0.0, 1.0);
    vec3 ro = vec3(0.4 * sin(0.04 * drift), 0.35 * cos(0.035 * drift), drift);
    vec3 rd = normalize(vec3(p, 1.1));
    rd.xz = rot2(0.25 * sin(0.021 * sceneTime)) * rd.xz;
    rd.yz = rot2(0.18 * sin(0.017 * sceneTime + 1.0)) * rd.yz;
    // what lies behind everything: the photo, as a glowing backdrop
    vec3 photoBack = imgLod(rd.xy * 0.5 / max(rd.z, 0.3) + 0.5, 2.0);
    vec3 col = famCol(fh, 0.5) * (0.08 + 0.5 * luma(photoBack)) * back;
    float trans = 1.0;
    float t = 0.1;
    for (int i = 0; i < 90; ++i) {
        vec3 x = ro + rd * t;
        vec3 cid = floor(x / CELL + 0.5);
        vec3 q0 = x - cid * CELL;
        float hc = fract(sin(dot(cid, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        bool here = fract(hc * 13.7) < present && !(cid.x == 0.0 && cid.y == 0.0);
        mat3 R = axisRotD(normalize(fract(hc * vec3(3.1, 5.7, 7.3)) - 0.5 + vec3(0.0, 0.0, 0.01)), spin * (0.5 + hc) + 6.2831853 * hc);
        vec3 q = R * q0;
        vec3 d3 = abs(q) - half_;
        float d = here ? length(max(d3, 0.0)) + min(max(d3.x, max(d3.y, d3.z)), 0.0) : 1e3;
        if (d < 0.002 && trans > 0.02) {
            // the face's normal (in the cube's frame), the angle to the eye
            vec3 a = abs(q);
            vec3 nq = a.x > a.y && a.x > a.z ? vec3(sign(q.x), 0.0, 0.0) : a.y > a.z ? vec3(0.0, sign(q.y), 0.0) : vec3(0.0, 0.0, sign(q.z));
            vec3 n = nq * R;                                     // back to the world
            float ci = abs(dot(n, rd));
            float band = 0.2 + 0.6 * ci;                         // the reflected shade slides with the angle
            float refl = 0.35 + 0.4 * (1.0 - ci);
            vec3 rc = famLight(fh, band, 0.2) * refl;
            // an edge: where the middle of the three coordinates also reaches the face
            float mid = a.x + a.y + a.z - max(max(a.x, a.y), a.z) - min(min(a.x, a.y), a.z);
            float edge = exp(-pow((half_ - mid) / 0.01, 2.0));
            col += trans * (rc * (0.6 + 0.6 * luma(photoBack)) + famLight(fh, 0.7, 0.6) * edge * (0.2 + 1.2 * kick)) * exp(-0.05 * t);
            // what passes: the neighbouring shade, dimmed; the ray goes on through the cube
            trans *= 0.55;
            col = mix(col, col * famCol(fh, fract(band + 0.5)) * 1.6, 0.25 * trans);
            t += 2.0 * half_;
            continue;
        }
        vec3 wall = (0.5 * CELL - abs(q0)) / max(abs(rd), 1e-3);
        t += clamp(0.8 * d, 0.01, max(min(wall.x, min(wall.y, wall.z)), 0.0) + 0.02);
        if (t > 30.0) break;
    }
    finish(col);
}
