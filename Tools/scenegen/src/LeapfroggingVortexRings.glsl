//@doc
 * @brief LEAPFROGGING VORTEX RINGS: pairs of vortex rings made of glowing points travel through a dark space in
 * different directions, and in each pair the rings leapfrog: the rear ring shrinks, speeds up and slips through the
 * front one, which widens and slows, and then they swap roles, again and again.  A pair's rings share an axis; their
 * radii swing in opposite phase round a mean, their positions along the axis likewise, while the pair drifts on;
 * each ring is a circle of round points, turning slowly about its axis.  The points' light is shades of one colour
 * family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBass    -> the rings' strength: their mean radius swells
 *   audioAdvance -> the leapfrog's phase and the pairs' drift (integrated)
 *   audioSwell   -> the points' glow
 *
 * Knobs: pairP (how many pairs), pointP (how many points per ring), hueP.
//@params pairP pointP
//@audio audioBass audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float pairs = floor(3.0 + 1.0 * clamp(pairP, 0.0, 1.0));
    float M = floor(24.0 + 12.0 * clamp(pointP, 0.0, 1.0));
    float ph = 0.25 * sceneTime + 1.0 * audioAdvance;
    float R0 = 0.4 + 0.1 * clamp(audioBass, 0.0, 1.0);
    float glow = 0.7 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec3 col = famCol(fh, 0.45) * 0.012;
    for (int k = 0; k < 4; ++k) {
        float fk = float(k);
        if (fk >= pairs) break;
        vec3 ax = normalize(vec3(sin(2.1 * fk + 0.4), 0.4 * cos(1.7 * fk), cos(2.1 * fk + 0.4)));
        vec3 u1 = normalize(cross(ax, vec3(0.0, 1.0, 0.0))), u2 = cross(ax, u1);
        // the pair drifts along its axis, wrapping round the space
        float drift = mod(0.12 * ph + 1.3 * fk, 3.0) - 1.5;
        vec3 base = vec3(0.9 * sin(2.7 * fk + 0.5), 0.35 * cos(1.9 * fk), 2.4) + ax * drift;
        for (int r = 0; r < 2; ++r) {
            float s = r == 0 ? 1.0 : -1.0;
            float lf = ph + 1.7 * fk;
            float R = R0 * (1.0 + 0.3 * s * sin(lf));
            vec3 c = base + ax * (0.18 * s * cos(lf));
            for (int i = 0; i < 36; ++i) {
                float fi = float(i);
                if (fi >= M) break;
                float a = 6.2831853 * fi / M + 0.3 * ph * s;
                vec3 x = c + R * (cos(a) * u1 + sin(a) * u2);
                if (x.z < 0.3) continue;
                vec2 sp = x.xy / x.z * 1.3;
                float size = 0.004 + 0.014 / x.z;
                float d = length(p - sp);
                float g = smoothstep(size, size * 0.6, d) + 0.2 * exp(-d / (size * 2.5));
                float fade = smoothstep(1.5, 1.1, abs(drift));
                col += famLight(fh, 0.2 + 0.5 * fract(fk * 0.37) + 0.1 * s, 0.4) * g * glow * fade * (1.4 / x.z);
            }
        }
    }
    finish(famExpose(col, 4.10, 0.70, 0.05, fh));
}
