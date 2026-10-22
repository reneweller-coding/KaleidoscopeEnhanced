//@doc
 * @brief BUDDHABROT NEBULA FLIGHT: the Buddhabrot -- the density of all escaping orbits of z <- z^2 + c -- as a nebula
 * in three dimensions: each orbit point stands as deep as its orbit took to escape, so the short, wild orbits form
 * a veil in front and the long, patient ones the glowing core behind; the eye circles the nebula slowly.  The density
 * is gathered over time in the state field: every step draws a dozen parameters near the Mandelbrot set's rim (on the
 * cardioid and the main bulb, where the orbits are long), runs their orbits and adds each point's light to the cells
 * it falls near, while the old light fades.  Three exposures as three shades, like the Nebulabrot.  One colour family
 * from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBass/Mid/High -> the three exposures' iteration limits (short, middle, long orbits)
 *   audioAdvance       -> the eye's slow circling (integrated)
 *   audioSwell         -> the nebula's glow
 *
 * Knobs: depthP (how deep the escape time stretches the nebula), glowP (how far each point's light spreads), hueP.
 * Distinct from BuddhabrotCosmicGhost, which is flat.
//@params depthP glowP
//@audio audioBass audioMid audioHigh audioSwell
//@state 400 225 20
//@body
/**  The eye and the projection of an orbit point onto the state field.
 *
 * @param z      The orbit point. (in)
 * @param depth  Its depth (from the escape time). (in)
 * @param eye    The eye. (in)
 * @param fw     The view direction. (in)
 * @param rt     The screen's right. (in)
 * @param up     The screen's up. (in)
 *
 * @return
 *   The cell coordinate (xy) and the distance in front of the eye (z).
 **/
vec3 projectB(vec2 z, float depth, vec3 eye, vec3 fw, vec3 rt, vec3 up)
{
    vec3 v = vec3(z.x + 0.4, z.y, depth) - eye;
    float d = max(dot(v, fw), 0.05);
    vec2 s = vec2(dot(v, rt), dot(v, up)) / d * 1.0;
    return vec3((s / vec2(stateRes.x / stateRes.y, 1.0) + 0.5) * stateRes, d);
}

/**  One gathering step for this cell: a dozen fresh orbits splatted (as a gather) into the faded old light.
 *
 * @return
 *   The three exposures' light.
 **/
vec4 stateStep()
{
    vec2 here = vec2(stCell()) + 0.5;
    float orbit = 0.02 * sceneTime + 0.08 * audioAdvance;
    vec3 eye = vec3(2.3 * sin(orbit), 0.6 * sin(0.6 * orbit), -2.3 * cos(orbit));
    vec3 fw = normalize(vec3(0.0, 0.0, 0.0) - eye);
    vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
    vec3 up = cross(rt, fw);
    float stretch = 1.2 + 1.6 * clamp(depthP, 0.0, 1.0);
    float sig = 1.3 + 1.6 * clamp(glowP, 0.0, 1.0);
    vec3 limits = vec3(12.0, 26.0, 52.0) * (0.8 + 0.4 * vec3(clamp(audioBass, 0.0, 1.0), clamp(audioMid, 0.0, 1.0),
                                                              clamp(audioHigh, 0.0, 1.0)));
    vec3 acc = vec3(0.0);
    for (int k = 0; k < 16; ++k) {
        // a parameter near the set's rim: on the cardioid or the period-2 bulb, pushed out a little
        float th = 6.2831853 * stRandStep(k);
        float out_ = 0.004 + 0.08 * stRandStep(k + 20) * stRandStep(k + 40);
        vec2 c = stRandStep(k + 60) < 0.7
                 ? (0.5 * vec2(cos(th), sin(th)) - 0.25 * vec2(cos(2.0 * th), sin(2.0 * th))) * (1.0 + out_)
                 : vec2(-1.0, 0.0) + (0.25 + out_) * vec2(cos(th), sin(th));
        // its escape time
        vec2 z = vec2(0.0);
        float esc = 0.0;
        for (int i = 0; i < 64; ++i) {
            z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
            if (dot(z, z) > 4.0) { esc = float(i + 1); break; }
        }
        if (esc < 3.0) continue;
        float depth = (esc / 64.0 - 0.3) * stretch;
        vec3 band = step(vec3(esc), limits);                     // which exposures this orbit belongs to
        z = vec2(0.0);
        for (int i = 0; i < 64; ++i) {
            if (float(i) >= esc - 1.0) break;
            z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
            vec3 pr = projectB(z, depth, eye, fw, rt, up);
            vec2 d = (here - pr.xy) / (sig * 3.0 / pr.z);
            acc += band * exp(-dot(d, d)) * (3.0 / pr.z);
        }
    }
    vec4 old = stateFrame < 0.5 ? vec4(0.0) : stAt(stCell());
    return vec4(old.rgb * 0.985 + acc * 0.12, 1.0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float fh = famHue();
    vec2 cc = (p / vec2(stateRes.x / stateRes.y, 1.0) + 0.5) * stateRes;
    vec3 d = stLin(cc).rgb;
    vec3 lit = 1.0 - exp(-d * (0.35 + 0.35 * clamp(audioSwell, 0.0, 1.0)));
    vec3 col = famCol(fh, 0.2) * lit.r * 0.6 + famCol(fh, 0.55) * lit.g * 0.7 + famLight(fh, 0.85, 0.5) * lit.b;
    col += famCol(fh, 0.5) * 0.012;
    finish(col);
}
