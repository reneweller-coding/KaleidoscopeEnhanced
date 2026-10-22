//@doc
 * @brief BEADS ON SPINNING HOOPS: a lattice of hoops spinning about their vertical diameters, each with glowing beads
 * that slide freely on it: when a hoop spins slowly its beads rest at the bottom, but above a critical speed they
 * climb to two new equilibria at cos(theta) = g / (w^2 R), pairs of beads rising and falling with the spin.  The
 * hoops stand in rows into the depth; each is seen as a turning ellipse of light, its beads bright points on it.  The
 * light is shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the spin rate: in loud passages the beads climb to their new equilibria, in quiet ones they sink
 *   audioAdvance -> the hoops' turning (integrated)
 *
 * Knobs: hoopP (how many hoops per row), beadP (how many beads per hoop), hueP.
//@params hoopP beadP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float per = floor(4.0 + 3.0 * clamp(hoopP, 0.0, 1.0));
    float beads = floor(1.0 + 2.0 * clamp(beadP, 0.0, 1.0));
    float w2 = 0.6 + 1.8 * clamp(audioSwell, 0.0, 1.0);         // w^2 R / g
    float theta = acos(clamp(1.0 / w2, -1.0, 1.0));              // the equilibrium: 0 below the critical speed
    float turn = 0.2 * sceneTime + 0.8 * audioAdvance;
    vec3 col = famCol(fh, 0.45) * 0.012;
    for (int r = 2; r >= 0; --r) {
        float fr = float(r);
        float z = 1.2 + 0.9 * fr;
        float S = 3.4 / per;
        float wx = p.x * z / 1.2;
        float k = floor(wx / S + 0.5);
        float hk = fract(sin(k * 12.9898 + fr * 7.7) * 43758.5453);
        float R = S * 0.38;
        vec2 c = vec2(k * S, 0.15 - 0.3 * fr);
        float phi = turn * (0.8 + 0.4 * hk) + 6.2831853 * hk;
        // the hoop: a circle about the vertical axis, turned by phi -- seen as an ellipse
        float best = 1e9;
        vec2 prev = vec2(0.0);
        for (int i = 0; i <= 48; ++i) {
            float a = 6.2831853 * float(i) / 48.0;
            vec3 x = vec3(R * sin(a) * cos(phi), -R * cos(a), R * sin(a) * sin(phi));
            vec2 sp = (c + x.xy) * 1.2 / (z + x.z);
            if (i > 0) {
                vec2 e = sp - prev;
                best = min(best, length(p - prev - e * clamp(dot(p - prev, e) / max(dot(e, e), 1e-8), 0.0, 1.0)));
            }
            prev = sp;
        }
        float hoop = exp(-pow(best / 0.0025, 2.0)) * 0.5 + 0.1 * exp(-best / 0.01);
        // the beads: at +-theta from the bottom (two per side for more beads, a little apart)
        float bl = 0.0;
        for (int b = 0; b < 3; ++b) {
            if (float(b) >= beads) break;
            for (int s = 0; s < 2; ++s) {
                float a = (s == 0 ? 1.0 : -1.0) * (theta + 0.12 * float(b));
                vec3 x = vec3(R * sin(a) * cos(phi), -R * cos(a), R * sin(a) * sin(phi));
                vec2 sp = (c + x.xy) * 1.2 / (z + x.z);
                float size = 0.004 + 0.01 / z;
                float d = length(p - sp);
                bl += smoothstep(size, size * 0.6, d) + 0.25 * exp(-d / (size * 2.0));
            }
        }
        col += (famLight(fh, 0.3 + 0.4 * hk, 0.2) * hoop + famLight(fh, 0.5, 0.8) * bl) / (1.0 + 0.4 * fr);
    }
    finish(col);
}
