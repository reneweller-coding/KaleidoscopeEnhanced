//@doc
 * @brief MANDELBOX GLOW CLOUD: the Mandelbox not as a body but as a cloud of light -- every step of the ray adds light
 * by how close it passes the fractal's surfaces and how deep its point was folded -- a nebula with sharp inner
 * chambers, round which the eye drifts on a slow orbit close to the box.  The box fold reflects a point back into the
 * cube of the fold limit, the ball fold inverts it in the unit sphere; then it is scaled and the start added again.
 * One colour family from the photo, the deeper folds a paler shade.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell       -> the scale breathes: the chambers widen and narrow
 *   audioHarmAdvance -> the fold limit glides with every chord change: walls part and close
 *   audioAdvance     -> the drift (integrated)
 *
 * Knobs: scaleP (the box's base scale), glowP (how far the glow reaches), hueP.  Distinct from Chain3DMandelbox,
 * which is a solid.
//@params scaleP glowP
//@audio audioSwell audioHarmAdvance
//@body
/**  The Mandelbox' distance, with the fold count and an orbit trap.
 *
 * @param p      The point. (in)
 * @param scale  The scale (negative: the interior is open). (in)
 * @param limit  The box fold's limit. (in)
 * @param trap   Returns the smallest |z|^2 along the orbit. (out)
 *
 * @return
 *   The distance estimate.
 **/
float mandelbox(vec3 p, float scale, float limit, out float trap)
{
    vec3 z = p;
    float dr = 1.0;
    trap = 1e9;
    for (int i = 0; i < 8; ++i) {
        z = clamp(z, -limit, limit) * 2.0 - z;
        float r2 = dot(z, z);
        trap = min(trap, r2);
        if (r2 < 0.25) {
            z *= 4.0;
            dr *= 4.0;
        } else if (r2 < 1.0) {
            z /= r2;
            dr /= r2;
        }
        z = z * scale + p;
        dr = dr * abs(scale) + 1.0;
    }
    return length(z) / abs(dr);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float h = max(audioHarmAdvance, 0.0);
    float scale = -1.55 - 0.25 * clamp(scaleP, 0.0, 1.0) - 0.12 * clamp(audioSwell, 0.0, 1.0);
    float limit = 1.0 + 0.12 * sin(0.8 * h) + 0.05 * sin(0.33 * h + 1.0);
    float reach = 90.0 - 40.0 * clamp(glowP, 0.0, 1.0);
    float orbit = 0.03 * sceneTime + 0.12 * audioAdvance;
    vec3 ro = vec3(3.1 * cos(orbit), 0.9 * sin(1.3 * orbit), 3.1 * sin(orbit));
    vec3 at = vec3(1.2 * cos(orbit + 0.9), 0.4 * sin(0.7 * orbit), 1.2 * sin(orbit + 0.9));
    vec3 fw = normalize(at - ro);
    vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
    vec3 up = cross(rt, fw);
    vec3 rd = normalize(fw * 1.0 + rt * p.x + up * p.y);
    vec3 col = vec3(0.0);
    float t = 0.05;
    for (int i = 0; i < 120; ++i) {
        vec3 x = ro + rd * t;
        float trap;
        float d = mandelbox(x, scale, limit, trap);
        // the cloud: inside the box the orbit trap draws chambers and veils; outside it fades with the distance
        float inside = exp(-reach * max(d, 0.0));
        float veil = pow(clamp(1.0 - sqrt(trap) / 1.1, 0.0, 1.0), 3.0);
        float shade = clamp(sqrt(trap) * 0.8, 0.0, 1.0);
        float fade = exp(-0.45 * t);
        col += famLight(fh, shade, 0.5 * veil) * (veil * 0.9 + 0.08) * inside * fade * 0.06;
        t += clamp(d * 0.7, 0.025, 0.2);
        if (t > 8.0) break;
    }
    col += famCol(fh, 0.5) * 0.012;
    finish(col);
}
