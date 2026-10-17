//@doc
 * @brief SOL GEOMETRY TUNNEL: a flight through Sol, the strangest of Thurston's eight geometries -- moving forward
 * stretches one sideways direction and squeezes the other.  The space is filled with a lattice of glowing beads:
 * every bead runs on a hyperbola, swinging out along one axis while it closes in along the other, and after one
 * period of the flight the whole lattice has become itself again (the cat map's eigen-stretch), so the flight is
 * endless.  The beads take the photo's colours by the hyperbola they run on; the photo behind stretches and
 * squeezes with them.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the flight, and with it the stretching (integrated: the music's drive)
 *   audioSwell      -> the beads swell
 *   audioKick       -> the beads flash (light)
 *
 * Knobs: beadP (the beads' size), densityP (the lattice's density), photoP (photo share), hueP.
//@params beadP densityP photoP
//@audio audioSwell audioKick
//@body
void main()
{
    vec2 p = screenP();
    const float L = 0.9624237;                                  // ln(phi^2): one period of the stretch
    const float DZ = L / 8.0;                                   // the slices' spacing
    float zc = 0.25 * sceneTime + 0.8 * audioAdvance;           // the eye's depth
    float dens = 0.6 + 0.7 * clamp(densityP, 0.0, 1.0);
    float rad = (0.035 + 0.03 * clamp(beadP, 0.0, 1.0)) * (0.8 + 0.5 * clamp(audioSwell, 0.0, 1.0));
    vec2 a = vec2(0.8506508, -0.5257311), b = vec2(0.5257311, 0.8506508);   // the integer lattice in the eigenbasis
    vec3 tone = imgPalette(0.4 + 0.03 * audioPhase);
    // behind everything: the photo, stretched one way and squeezed the other with the flight's phase
    float sp = 0.45 * sin(6.2831853 * zc / L);
    vec3 col = imgLod(mirrorUV(p * vec2(exp(sp), exp(-sp)) * 0.4 + 0.5), 1.5) * 0.22 + tone * 0.04;
    vec3 acc = vec3(0.0);
    float T = 1.0;
    float j0 = floor(zc / DZ) + 1.0;
    for (int k = 0; k < 48; ++k) {
        float zj = (j0 + float(k)) * DZ;                        // the slice's place in the world
        float D = zj - zc;                                      // its depth before the eye
        vec2 X = p * D * 1.1 / dens + vec2(0.31, 0.47);         // the screen point on the slice, in lattice units
        float zz = zj - L * floor(zj / L + 0.5);                // the same lattice, its basis least sheared
        vec2 ez = vec2(exp(zz), exp(-zz));
        vec2 az = a * ez, bz = b * ez;
        vec2 c = vec2(bz.y * X.x - bz.x * X.y, -az.y * X.x + az.x * X.y);   // the coefficients (det = 1)
        vec2 c0 = floor(c + 0.5);
        float dmin = 1e9;
        vec2 best = vec2(0.0);
        for (int i = -1; i <= 1; ++i) for (int j = -1; j <= 1; ++j) {
            vec2 P = (c0.x + float(i)) * az + (c0.y + float(j)) * bz;
            float dd = length(X - P);
            if (dd < dmin) { dmin = dd; best = P; }
        }
        float rs = rad / dens;
        float bead = smoothstep(rs, rs * 0.4, dmin);
        if (bead > 0.001) {
            // colour by the hyperbola the bead runs on: X * Y is kept by the stretch
            float hyp = best.x * best.y;
            vec3 photo = imgLod(mirrorUV(vec2(hyp * 0.25 + 0.5, 0.5 + 0.2 * sign(best.x) + 0.1 * sign(best.y))), 0.6);
            vec3 tb = imgPalette(hyp * 0.15 + 0.03 * audioPhase);
            vec3 cb = mix(tb * 1.3, photo * 1.5, 0.4 + 0.5 * clamp(photoP, 0.0, 1.0)) * (1.0 + 0.8 * clamp(audioKick, 0.0, 1.0));
            float alpha = bead * smoothstep(0.05, 0.35, D) * exp(-0.35 * D);
            acc += T * alpha * cb;
            T *= 1.0 - alpha;
            if (T < 0.02) break;
        }
    }
    col = acc + T * col;
    finish(col);
}
