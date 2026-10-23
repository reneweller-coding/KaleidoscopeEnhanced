//@doc
 * @brief PRECESSION STAR ROSETTE: precession: the celestial pole circles the pole of the ecliptic in 26,000 years, and the stars draw rosettes; the picture shows concentric circles of photo stars whose centres wander.  Eighteen circles of stars have centres that move on small circles of their own, the stars
 * run round their circles at their own speed, and every star takes its colour from the photo where it stands.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the centres wander round the pole (integrated)
 *   audioAdvance     -> the stars run round (integrated)
 *
 * Knobs: sizeP (the size of the stars), hueP.
//@params sizeP
//@audio audioAdvance audioHarmAdvance
//@body
void main()
{
    vec2 p = screenP();
    vec3 col = imgLod(p * 0.85 + 0.5, 2.0) * 0.12 + vec3(0.005, 0.008, 0.02);
    float t = 0.02 * audioHarmAdvance + 0.02 * sceneTime;
    float sr = 0.008 + 0.01 * clamp(sizeP, 0.0, 1.0);
    for (int k = 0; k < 18; ++k) {
        float fk = float(k);
        float R = 0.05 + 0.032 * fk;
        vec2 cen = 0.06 * (0.3 + 0.07 * fk) * vec2(cos(t * (1.0 + 0.05 * fk) + 0.6 * fk), sin(t * (1.0 + 0.05 * fk) + 0.6 * fk));
        vec2 d = p - cen;
        float r = length(d);
        float ring = abs(r - R);
        if (ring > 0.03) continue;
        float n = floor(R * 160.0);
        float a = atan(d.y, d.x) - (0.02 * audioAdvance + 0.03 * sceneTime) * (0.6 + 0.4 * hash11(fk)) * (mod(fk, 2.0) < 0.5 ? 1.0 : -1.0);
        float u = a / 6.2831853 * n;
        float kk = floor(u + 0.5);
        float ac = kk / n * 6.2831853 + (0.02 * audioAdvance + 0.03 * sceneTime) * (0.6 + 0.4 * hash11(fk)) * (mod(fk, 2.0) < 0.5 ? 1.0 : -1.0);
        vec2 sp = cen + R * vec2(cos(ac), sin(ac));
        float ds = length(p - sp);
        float tw = 0.7 + 0.3 * sin(2.0 * sceneTime + kk * 3.0);
        vec3 c = imgLod(sp * 0.85 + 0.5, 1.0);
        c = mix(vec3(luma(c)), c, 1.5) * 1.6 + 0.2;
        col += c * exp(-ds * ds / (sr * sr)) * tw * 1.2;
    }
    finish(col);
}
