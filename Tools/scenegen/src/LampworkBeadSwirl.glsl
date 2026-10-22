//@doc
 * @brief LAMPWORK BEAD SWIRL: a close macro view of lampwork glass beads, so close that their dots, eyes and spirals
 * fill the picture: rows of round beads turning on their mandrels, glossy, each decorated with raised dots, twisted
 * stripes or combed feathers that change with the music's sections.  Each bead is a slightly flattened ball seen from
 * the side; its decoration is painted in the ball's own coordinates -- the turn round the mandrel and the place along
 * it -- so it rolls as the bead turns; a highlight and a dark rim give the ball its volume.  The colours are shades of
 * one family from the photo with white and a deep base.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance       -> the beads turn on their mandrels (integrated, each row at its own speed)
 *   audioSectionId/Age -> every new section brings another decoration (cross-faded over six seconds)
 *   audioSwell         -> the glass' glow from within
 *
 * Knobs: beadP (the beads' size), decorP (how busy the decoration is), hueP.
//@params beadP decorP
//@audio audioSectionId audioSectionPrev audioSectionAge audioSwell
//@body
/**  A bead's decoration at a place on the ball.
 *
 * @param phi   The turn round the mandrel. (in)
 * @param s     The place along the mandrel, -1..1. (in)
 * @param kind  0 dots with eyes, 1 twisted stripes, 2 combed feathers. (in)
 * @param busy  How dense the decoration is. (in)
 *
 * @return
 *   x the white, y the accent colour's share.
 **/
vec2 decor(float phi, float s, float kind, float busy)
{
    if (kind < 0.5) {
        float n = 5.0 + floor(3.0 * busy);
        vec2 q = vec2(fract(phi * n / 6.2831853) - 0.5, fract(s * 1.2 + 0.5 + 0.5 * floor(phi * n / 6.2831853)) - 0.5);
        float r = length(q);
        return vec2(smoothstep(0.3, 0.26, r) * smoothstep(0.14, 0.18, r), smoothstep(0.13, 0.09, r));
    }
    if (kind < 1.5) {
        float k = 3.0 + 2.0 * floor(2.0 * busy);
        float t = fract(phi * k / 6.2831853 + 1.2 * s);
        return vec2(smoothstep(0.32, 0.4, abs(t - 0.5)), smoothstep(0.1, 0.02, abs(t - 0.25)));
    }
    float t = fract(phi * 3.0 / 6.2831853 + 0.3 * sin(5.0 * s + 2.0 * phi));
    return vec2(smoothstep(0.35, 0.45, abs(t - 0.5)), smoothstep(0.12, 0.04, abs(t - 0.3 - 0.1 * busy)));
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float H = 0.3 + 0.14 * clamp(beadP, 0.0, 1.0);
    float busy = clamp(decorP, 0.0, 1.0);
    float m = smoothstep(0.0, 6.0, audioSectionAge);
    float kA = mod(max(audioSectionPrev, 0.0), 3.0), kB = mod(max(audioSectionId, 0.0), 3.0);
    float run = 0.05 * sceneTime + 0.2 * audioAdvance;
    float glow = 0.2 + 0.4 * clamp(audioSwell, 0.0, 1.0);
    float row = floor(p.y / H + 0.5);
    float yl = p.y - row * H;
    float x = p.x + 0.4 * run * (fract(row * 0.37) - 0.5);           // each row drifts a little sideways
    float W = H * 1.05;
    float bi = floor(x / W + 0.5);
    float xl = x - bi * W;
    vec2 e = vec2(xl / (0.48 * W), yl / (0.47 * H));
    float r2 = dot(e, e);
    // between the beads: the dark mandrel with a steel glint
    vec3 col = famCol(fh, 0.4) * 0.03 + vec3(0.5) * exp(-pow(yl / 0.004, 2.0)) * 0.12;
    if (r2 < 1.0) {
        float z = sqrt(1.0 - r2);
        vec3 n = normalize(vec3(e, z));
        float hb = hash21(vec2(bi, row));
        float dirn = mod(row, 2.0) < 0.5 ? 1.0 : -1.0;
        float phi = atan(e.y, z) + run * (0.8 + 0.4 * fract(row * 0.61)) * dirn + 6.2831853 * hb;
        vec2 dc = (1.0 - m) * decor(phi, e.x, kA, busy) + m * decor(phi, e.x, kB, busy);
        vec3 base = famCol(fh, hb) * 0.45;
        vec3 accent = famCol(fh, fract(hb + 0.5)) * 0.9;
        vec3 c = mix(mix(base, famLight(fh, 0.5, 0.92), dc.x), accent, dc.y);
        vec3 L = normalize(vec3(-0.4, 0.6, 0.7));
        float dif = 0.35 + 0.65 * max(dot(n, L), 0.0);
        float spec = pow(max(dot(n, normalize(L + vec3(0.0, 0.0, 1.0))), 0.0), 60.0);
        vec3 bead = c * dif + c * glow * z + famLight(fh, 0.5, 0.9) * spec * 0.8;
        bead *= 0.55 + 0.45 * smoothstep(0.0, 0.35, z);              // the dark rim
        col = mix(col, bead, smoothstep(1.0, 0.96, r2));
    }
    finish(col);
}
