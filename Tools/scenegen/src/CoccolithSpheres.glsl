//@doc
 * @brief COCCOLITH SPHERES: a space full of coccospheres, near and far, each a ball armoured with interlocking oval
 * plates of calcite, turning slowly; the plates' pattern of ribs changes with the music's sections.  A sphere is seen
 * as a disc whose surface points are turned by its spin; sixteen plates sit at Fibonacci points on it, each surface
 * point belonging to the nearest; a plate is an oval with a raised rim, radial ribs and a central boss, so where two
 * ovals meet they interlock along the border between them.  The calcite is pale, lit from above, toned by the photo's
 * colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSectionId/Age -> every new section changes the plates' ribs (cross-faded over six seconds)
 *   audioAdvance       -> the spheres turn and drift (integrated)
 *   audioSwell         -> the plates' sheen
 *
 * Knobs: sphereP (how many spheres), sizeP (their size), hueP.
//@params sphereP sizeP
//@audio audioSectionId audioSectionPrev audioSectionAge audioSwell
//@body
/**  A plate's relief at a place on it.
 *
 * @param u     The place in the plate's own frame (radius 1 at its rim). (in)
 * @param kind  The ribs: 0 fine, 1 coarse, 2 none but rings. (in)
 *
 * @return
 *   The relief, 0..1.
 **/
float plate(vec2 u, float kind)
{
    float r = length(u), a = atan(u.y, u.x);
    float rim = exp(-pow((r - 0.9) / 0.08, 2.0));
    float boss = smoothstep(0.25, 0.12, r);
    float ribs = kind < 0.5 ? smoothstep(0.6, 1.0, cos(30.0 * a)) : kind < 1.5 ? smoothstep(0.3, 1.0, cos(12.0 * a))
                                                                              : smoothstep(0.5, 1.0, cos(25.0 * r));
    return clamp(rim + boss + 0.5 * ribs * smoothstep(0.85, 0.3, r) * smoothstep(0.15, 0.3, r), 0.0, 1.0);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float N = floor(6.0 + 3.0 * clamp(sphereP, 0.0, 1.0));
    float szK = 0.8 + 0.4 * clamp(sizeP, 0.0, 1.0);
    float m = smoothstep(0.0, 6.0, audioSectionAge);
    float kA = mod(max(audioSectionPrev, 0.0), 3.0), kB = mod(max(audioSectionId, 0.0), 3.0);
    float spin = 0.05 * sceneTime + 0.2 * audioAdvance;
    float drift = 0.02 * sceneTime + 0.08 * audioAdvance;
    float sheen = 0.5 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec3 col = famCol(fh, 0.45) * 0.02;
    for (int i = 0; i < 9; ++i) {                                    // far to near
        float fi = float(i);
        if (fi >= N) break;
        float near = (fi + 1.0) / N;
        float R = (0.07 + 0.2 * near * near) * szK;
        vec2 c = vec2(1.6 * (fract(fi * 0.7548777 + 0.6) - 0.5), 0.9 * (fract(fi * 0.5698403 + 0.8) - 0.5));
        c += vec2(0.08 * sin(drift + 2.0 * fi), 0.05 * cos(0.7 * drift + 3.0 * fi));
        vec2 q = (p - c) / R;
        float r = length(q);
        if (r > 1.02) continue;
        float z = sqrt(max(1.0 - r * r, 0.0));
        vec3 n = vec3(q, z);
        float sp = spin * (0.6 + 0.6 * fract(fi * 0.37)) + 2.0 * fi;
        n.xz = rot2(sp) * n.xz;
        n.xy = rot2(0.4 * fi) * n.xy;
        // the nearest of sixteen plates at Fibonacci points
        float best = -2.0;
        vec3 bd = vec3(0.0, 1.0, 0.0);
        for (int k = 0; k < 16; ++k) {
            float fk = float(k);
            float y = 1.0 - (fk + 0.5) / 8.0;
            float s = sqrt(max(1.0 - y * y, 0.0));
            vec3 dk = vec3(s * cos(2.39996 * fk), y, s * sin(2.39996 * fk));
            float dd = dot(n, dk);
            if (dd > best) { best = dd; bd = dk; }
        }
        vec3 u1 = normalize(cross(bd, vec3(0.3, 0.9, 0.2))), u2 = cross(bd, u1);
        vec2 u = vec2(dot(n, u1), dot(n, u2)) / vec2(0.62, 0.48);
        float rel = (1.0 - m) * plate(u, kA) + m * plate(u, kB);
        float dif = 0.3 + 0.7 * max(dot(vec3(q, z), normalize(vec3(-0.3, 0.6, 0.75))), 0.0);
        vec3 sc = famLight(fh, 0.5, 0.65) * (0.25 + 0.6 * rel) * dif * (0.5 + 0.5 * near);
        sc += famLight(fh, 0.5, 0.9) * pow(rel, 3.0) * pow(z, 2.0) * 0.25 * sheen;
        col = mix(col, sc, smoothstep(1.02, 0.97, r));
    }
    finish(famExpose(col, 2.05, 0.90, 0.00, fh));
}
