//@doc
 * @brief VORTEX LATTICE PARTICLES: round tracer particles riding a lattice of vortices that keeps deforming -- a
 * checkerboard of eddies turning left and right by turns (the cellular flow), sheared and breathing, its cells
 * leaning over and straightening.  Every particle is traced back along the flow to where it came from and wears the
 * photo's colour from there; they fade in and out over a few seconds, so the lattice of swirling beads renews itself.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the lattice deforms: shear and breath (integrated)
 *   audioSwell      -> the eddies spin faster
 *   audioKick       -> the particles flash (light)
 *
 * Knobs: cellsP (eddies across the frame), densityP (the particles' density), photoP (photo share), hueP.
//@params cellsP densityP photoP
//@audio audioSwell audioKick
//@body
float gK = 6.0;            // the eddies' wave number
float gPh = 0.0;           // the deformation's phase

/**  The deforming cellular flow's velocity.
 *
 * @param x  The point. (in)
 *
 * @return
 *   The velocity (the curl of psi = sin(k x') sin(k y), with x' sheared by a breathing amount).
 **/
vec2 cellVel(vec2 x)
{
    float sh = 0.45 * sin(gPh), br = 1.0 + 0.25 * sin(0.7 * gPh + 1.0);
    vec2 q = vec2(x.x + sh * x.y, x.y * br);
    float k = gK;
    float sx = sin(k * q.x), cx = cos(k * q.x), sy = sin(k * q.y), cy = cos(k * q.y);
    // psi(q(x)): u = d psi / d y, v = -d psi / d x (chain rule through the shear)
    float dpx = k * cx * sy, dpy = k * sx * cy;
    float dpsiDx = dpx, dpsiDy = dpx * sh + dpy * br;
    return vec2(dpsiDy, -dpsiDx) / (k * k) * 0.6;
}

void main()
{
    vec2 p = screenP();
    gK = 6.2831853 * (2.0 + 2.0 * clamp(cellsP, 0.0, 1.0));
    gPh = 0.02 * audioPhase + 0.05 * sceneTime;
    float spin = 2.0 + 3.0 * clamp(audioSwell, 0.0, 1.0);
    float spacing = 0.026 - 0.012 * clamp(densityP, 0.0, 1.0);
    float rad = spacing * 0.33, life = 2.2;
    vec3 tone = imgPalette(0.45 + 0.03 * audioPhase);
    vec3 col = imgLod(p * 0.3 + 0.5, 5.0) * 0.12;
    for (int ph = 0; ph < 2; ++ph) {
        float f = fract(sceneTime / life + 0.5 * float(ph));
        float w = 1.0 - abs(2.0 * f - 1.0);
        float tau = f * life * spin;
        vec2 x0 = p, xa = p + vec2(0.003, 0.0), xb = p + vec2(0.0, 0.003);
        for (int s = 0; s < 6; ++s) {
            float h = tau / 6.0;
            x0 -= cellVel(x0) * h; xa -= cellVel(xa) * h; xb -= cellVel(xb) * h;
        }
        mat2 J = mat2(xa - x0, xb - x0) / 0.003;
        float det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
        mat2 Ji = mat2(J[1][1], -J[0][1], -J[1][0], J[0][0]) / (abs(det) > 1e-4 ? det : 1e-4);
        vec2 g = x0 / spacing + float(ph) * 0.41;
        vec2 cell = floor(g);
        float best = 1e9;
        vec2 bestC = cell;
        for (int jj = -1; jj <= 1; ++jj) for (int ii = -1; ii <= 1; ++ii) {
            vec2 cc = cell + vec2(float(ii), float(jj));
            vec2 c = cc + 0.5 + 0.35 * (hash22(cc + float(ph) * 9.7) - 0.5);
            float d = length(Ji * ((g - c) * spacing));
            if (d < best) { best = d; bestC = cc; }
        }
        float dotA = smoothstep(rad, rad * 0.5, best);
        vec2 orig = (bestC + 0.5 - float(ph) * 0.41) * spacing;
        vec3 photo = imgLod(orig * 0.55 + 0.5, 1.0);
        vec3 c = mix(tone * 1.3, photo * 1.6, 0.5 + 0.45 * clamp(photoP, 0.0, 1.0)) * (1.0 + 0.4 * clamp(audioKick, 0.0, 1.0));
        col = mix(col, c * (0.75 + 0.5 * smoothstep(rad, 0.0, best)), dotA * w);
    }
    finish(col);
}
