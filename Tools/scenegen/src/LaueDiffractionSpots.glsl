//@doc
 * @brief LAUE DIFFRACTION SPOTS: the Laue pictures of several crystals laid over one another, dense as a field of stars:
 * a white X-ray beam meets each crystal, every set of lattice planes mirrors it into a spot on the screen, and as the
 * crystals turn the spots wander along curves and, whenever a crystal's axis swings near the beam, gather into four-
 * and six-fold stars.  For each lattice plane (its reciprocal vector G, h k l up to two) the beam along z is mirrored,
 * d = z - 2 (z . G^) G^, and lands at d.xy / d.z; the spot's strength falls with |G|.  Cubic and hexagonal crystals
 * alternate.  The spots are shades of one colour family from the photo, the strongest near white.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> how many crystals stand in the beam (they fade in and out one by one)
 *   audioAdvance -> the crystals turn (integrated)
 *
 * Knobs: spreadP (how far the spots spread on the screen), spotP (the spots' size), hueP.
//@params spreadP spotP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float D = 0.8 + 0.5 * clamp(spreadP, 0.0, 1.0);
    float ws = 0.005 + 0.004 * clamp(spotP, 0.0, 1.0);
    float n = 3.0 + 3.0 * clamp(audioSwell, 0.0, 1.0);
    float run = 0.03 * sceneTime + 0.12 * audioAdvance;
    vec3 col = famCol(fh, 0.45) * 0.015;
    col += famLight(fh, 0.5, 0.9) * exp(-dot(p, p) / 0.0004) * 0.8;  // the direct beam
    for (int c = 0; c < 6; ++c) {
        float fc = float(c);
        float wc = clamp(n - fc, 0.0, 1.0);
        if (wc <= 0.0) break;
        float a = 0.45 * sin(0.3 * run + 1.7 * fc), b = 0.45 * sin(0.23 * run + 2.9 * fc), g = 0.2 * run + fc;
        mat3 Rx = mat3(1.0, 0.0, 0.0, 0.0, cos(a), sin(a), 0.0, -sin(a), cos(a));
        mat3 Ry = mat3(cos(b), 0.0, -sin(b), 0.0, 1.0, 0.0, sin(b), 0.0, cos(b));
        mat3 Rz = mat3(cos(g), sin(g), 0.0, -sin(g), cos(g), 0.0, 0.0, 0.0, 1.0);
        mat3 Rm = Rx * Ry * Rz;
        bool hex = mod(fc, 2.0) > 0.5;
        float acc = 0.0;
        for (int i = 0; i < 125; ++i) {
            vec3 hkl = vec3(float(i % 5) - 2.0, float((i / 5) % 5) - 2.0, float(i / 25) - 2.0);
            if (dot(hkl, hkl) < 0.5) continue;
            vec3 G = hex ? vec3(hkl.x + 0.5 * hkl.y, 0.8660254 * hkl.y, 0.62 * hkl.z) : hkl;
            vec3 gh = normalize(Rm * G);
            vec3 d = vec3(0.0, 0.0, 1.0) - 2.0 * gh.z * gh;          // the beam mirrored by the planes
            if (d.z < 0.15) continue;
            vec2 spot = d.xy / d.z * D;
            vec2 dd = p - spot;
            acc += (exp(-dot(dd, dd) / (ws * ws)) + 0.12 * exp(-length(dd) / (3.0 * ws))) / length(G);
        }
        col += famLight(fh, 0.3 + 0.12 * fc, 0.5) * acc * wc * 0.9;
    }
    finish(famExpose(col, 5.55, 0.80, 0.05, fh));
}
