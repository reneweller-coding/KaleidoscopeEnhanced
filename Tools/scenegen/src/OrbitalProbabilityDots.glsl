//@doc
 * @brief ORBITAL PROBABILITY DOTS: a crystal of atoms: every lattice site is a cloud of points drawn from an orbital's
 * probability density -- s, p, d or f -- and the eye flies through the lattice, the clouds' lobes repeating to the
 * horizon.  The points are a fine jittered 3D lattice of candidate dots, each lit by |psi|^2 of its atom's orbital at
 * its place (hydrogen-like: e^(-r) times the angular part z, 3z^2 - r^2 or z (5z^2 - 3r^2)), so the clouds show their
 * nodes as dark planes and cones.  The dots' light is shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the chord changes choose the quantum numbers (s, p, d, f; the densities cross-faded)
 *   audioAdvance     -> the flight through the crystal (integrated)
 *   audioSwell       -> the clouds' brightness
 *
 * Knobs: dotP (how fine the dots are), cellP (the lattice' spacing), hueP.
//@params dotP cellP
//@audio audioHarmAdvance audioSwell
//@body
/**  An orbital's density at a point of its atom.
 *
 * @param q     The point (atom at 0). (in)
 * @param kind  0 s, 1 p, 2 d, 3 f. (in)
 *
 * @return
 *   |psi|^2 shaped: the angular part times a radial shell, at most 1 and gone before the cell's edge.
 **/
float orbital(vec3 q, float kind)
{
    float r = length(q) / 0.1;
    float c = q.z / max(length(q), 1e-4);                        // the cosine to the orbital's axis
    float k = mod(kind, 4.0);
    float ang = 1.0, rp = 1.2;
    if (k > 0.5 && k < 1.5) { ang = c * c; rp = 1.8; }
    else if (k > 1.5 && k < 2.5) { float a = 0.5 * (3.0 * c * c - 1.0); ang = a * a; rp = 2.4; }
    else if (k > 2.5) { float b = 0.5 * c * (5.0 * c * c - 3.0); ang = b * b; rp = 2.8; }
    return ang * exp(-pow((r - rp) / 0.9, 2.0));
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float h = max(audioHarmAdvance, 0.0);
    float hk = floor(h), hm = smoothstep(0.15, 0.85, h - hk);
    float D = 0.03 - 0.012 * clamp(dotP, 0.0, 1.0);             // the dot lattice' spacing
    float L = 0.8 + 0.4 * clamp(cellP, 0.0, 1.0);               // the atoms' spacing
    float fly = 0.12 * sceneTime + 0.5 * audioAdvance;
    float bright = 0.7 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec3 ro = vec3(0.5 * L + 0.1 * sin(0.3 * fly), 0.5 * L + 0.08 * cos(0.2 * fly), fly);
    vec3 rd = normalize(vec3(p, 1.2));
    rd.xz = rot2(0.25 * sin(0.03 * sceneTime)) * rd.xz;
    rd.yz = rot2(0.2 * sin(0.025 * sceneTime + 1.0)) * rd.yz;
    const mat3 SKEW = mat3(0.9287, 0.0000, -0.3709, 0.1778, 0.8776, 0.4452, 0.3255, -0.4794, 0.8150);
    vec3 col = vec3(0.0);
    float t = 0.05;
    for (int i = 0; i < 110; ++i) {
        vec3 x = ro + rd * t;
        vec3 cid = floor(x / L + 0.5);
        // the nearest candidate dot of the fine jittered lattice
        // the dot lattice stands askew to the view, so its cells never line up into seams
        vec3 dc = floor(SKEW * x / D);
        float hd = fract(sin(dot(dc, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        vec3 dp = ((dc + 0.5 + 0.6 * (fract(hd * vec3(3.1, 5.7, 7.3)) - 0.5)) * D) * SKEW;
        float d = length(cross(dp - ro, rd));                    // the dot's distance from the ray
        vec3 qd = dp - cid * L;
        float dens = mix(orbital(qd, hk), orbital(qd, hk + 1.0), hm);
        float lit = exp(-pow(d / (0.18 * D), 2.0)) * smoothstep(hd - 0.05, hd + 0.05, dens * 0.9);   // dots fade in and out
        col += famLight(fh, 0.2 + 0.6 * fract(dot(cid, vec3(0.13, 0.29, 0.07))), 0.4) * lit * exp(-0.4 * t) * 0.5;
        t += D * 0.7;
    }
    col *= bright;
    finish(col);
}
