//@doc
 * @brief MANDELBULB AURA SHELL: a flight close above the Mandelbulb's surface, of which only the rim glows -- the
 * Fresnel edge where the surface turns away from the eye -- a range of mountains drawn in lines of light that
 * passes filling the frame, the bulb's body dark beneath it.  The bulb is z <- z^n + c in spherical coordinates, the
 * distance 0.5 r log r / dr; the rim's light is (1 - |n . v|)^k, gathered with a faint glow of the surface passed
 * close by.  One colour family from the photo, the rim shaded by the orbit trap.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the power glides with the chord changes between 4 and 9: ridges multiply and merge
 *   audioAdvance     -> the flight over the surface (integrated)
 *   audioSwell       -> the rim widens
 *
 * Knobs: heightP (how high above the surface the eye flies), rimP (how thin the rim), hueP.
//@params heightP rimP
//@audio audioHarmAdvance audioSwell
//@body
/**  The Mandelbulb's distance.
 *
 * @param p     The point. (in)
 * @param n     The power. (in)
 * @param trap  Returns the smallest radius along the orbit. (out)
 *
 * @return
 *   The distance estimate.
 **/
float bulb(vec3 p, float n, out float trap)
{
    vec3 z = p;
    float dr = 1.0, r = length(z);
    trap = 1e9;
    for (int i = 0; i < 8; ++i) {
        r = length(z);
        if (r > 2.0) break;
        trap = min(trap, r);
        float th = acos(clamp(z.z / max(r, 1e-6), -1.0, 1.0)) * n;
        float ph = atan(z.y, z.x) * n;
        dr = pow(r, n - 1.0) * n * dr + 1.0;
        z = pow(r, n) * vec3(sin(th) * cos(ph), sin(th) * sin(ph), cos(th)) + p;
    }
    return 0.5 * log(max(r, 1e-6)) * r / dr;
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float h = max(audioHarmAdvance, 0.0);
    float n = 6.5 + 2.0 * sin(0.6 * h) + 0.5 * sin(0.27 * h + 1.0);
    float rimK = 2.0 + 3.0 * clamp(rimP, 0.0, 1.0) - 1.2 * clamp(audioSwell, 0.0, 1.0);
    float height = 1.42 + 0.2 * clamp(heightP, 0.0, 1.0);
    float fly = 0.025 * sceneTime + 0.1 * audioAdvance;
    vec3 ro = height * normalize(vec3(cos(fly), 0.45 * sin(0.7 * fly), sin(fly)));
    vec3 at = 0.85 * normalize(vec3(cos(fly + 0.45), 0.4 * sin(0.7 * fly + 0.4), sin(fly + 0.45)));
    vec3 fw = normalize(at - ro);
    vec3 rt = normalize(cross(fw, normalize(ro)));
    vec3 up = cross(rt, fw);
    vec3 rd = normalize(fw * 1.0 + rt * p.x + up * p.y);
    vec3 col = vec3(0.0);
    float t = 0.02, glow = 0.0, trap = 1.0;
    bool hit = false;
    for (int i = 0; i < 120; ++i) {
        float d = bulb(ro + rd * t, n, trap);
        glow += exp(-40.0 * max(d, 0.0)) * 0.015;
        if (d < 0.0005 * (1.0 + 2.0 * t)) { hit = true; break; }
        t += d * 0.85;
        if (t > 4.0) break;
    }
    if (hit) {
        vec3 x = ro + rd * t;
        float e = 0.0008 * (1.0 + 2.0 * t), tr;
        vec3 nrm = normalize(vec3(bulb(x + vec3(e, 0.0, 0.0), n, tr) - bulb(x - vec3(e, 0.0, 0.0), n, tr),
                                  bulb(x + vec3(0.0, e, 0.0), n, tr) - bulb(x - vec3(0.0, e, 0.0), n, tr),
                                  bulb(x + vec3(0.0, 0.0, e), n, tr) - bulb(x - vec3(0.0, 0.0, e), n, tr)));
        float rim = pow(1.0 - abs(dot(nrm, rd)), max(rimK, 0.8));
        float fade = exp(-0.4 * t);
        col += famLight(fh, clamp(trap * 0.9, 0.0, 1.0), 0.4 * rim) * rim * fade * 1.3;
    }
    col += famCol(fh, 0.35) * glow;
    col += famCol(fh, 0.5) * 0.012;
    finish(col);
}
