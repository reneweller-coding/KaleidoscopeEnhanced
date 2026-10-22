//@doc
 * @brief NEWTON BASIN LIGHT: Newton's method for a cubic with three roots -- every point slides toward one of them --
 * and only the fractal borders between the three basins glow, where a point takes long to decide; the basins
 * themselves stay dark.  The light is the smooth count of steps until a point has settled, so the borders' filigree
 * shines brightest at its finest.  The view breathes slowly in and out of the border.  One colour family from the
 * photo, each basin's rim a shade of its own.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the three roots wander with the chord changes: the borders flow and re-knot
 *   audioRoughness   -> the relaxation factor (rough sound overshoots the steps: wilder, lacier borders)
 *   audioAdvance     -> the drift along the border (integrated)
 *
 * Knobs: zoomP (how deep the view breathes into the border), lightP (how much of the border glows), hueP.  Distinct
 * from NewtonBasinPsychedelicSea, which colours the basins.
//@params zoomP lightP
//@audio audioHarmAdvance audioRoughness
//@body
/**  The complex product.
 *
 * @param a  One factor. (in)
 * @param b  The other. (in)
 *
 * @return
 *   a b.
 **/
vec2 cmulN(vec2 a, vec2 b)
{
    return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

/**  The complex quotient.
 *
 * @param a  The dividend. (in)
 * @param b  The divisor. (in)
 *
 * @return
 *   a / b.
 **/
vec2 cdivN(vec2 a, vec2 b)
{
    return vec2(a.x * b.x + a.y * b.y, a.y * b.x - a.x * b.y) / max(dot(b, b), 1e-12);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float h = max(audioHarmAdvance, 0.0);
    vec2 r1 = vec2(1.0, 0.0) + 0.25 * vec2(sin(0.7 * h), cos(0.5 * h));
    vec2 r2 = vec2(-0.5, 0.866) + 0.25 * vec2(cos(0.6 * h + 1.0), sin(0.45 * h));
    vec2 r3 = vec2(-0.5, -0.866) + 0.25 * vec2(sin(0.55 * h + 2.0), cos(0.65 * h + 1.0));
    float relax = 1.0 + 0.45 * clamp(audioRoughness, 0.0, 1.0);
    float lightK = 0.6 + 0.8 * clamp(lightP, 0.0, 1.0);
    // the view: drifting along the border between roots 1 and 2, breathing in and out
    float drift = 0.02 * sceneTime + 0.08 * audioAdvance;
    float breath = 0.5 - 0.5 * cos(0.04 * sceneTime);
    float zoom = mix(0.9, mix(0.4, 0.12, clamp(zoomP, 0.0, 1.0)), breath);
    vec2 border = 0.5 * (r1 + r2) * (0.3 + 0.25 * sin(drift)) + 0.2 * vec2(cos(1.7 * drift), sin(1.3 * drift));
    vec2 z = border + rot2(0.03 * sceneTime) * p * zoom;
    float n = 0.0, which = 0.0;
    for (int i = 0; i < 40; ++i) {
        vec2 a = z - r1, b = z - r2, c = z - r3;
        vec2 f = cmulN(cmulN(a, b), c);
        vec2 df = cmulN(a, b) + cmulN(b, c) + cmulN(a, c);
        z -= relax * cdivN(f, df);
        float d1 = dot(z - r1, z - r1), d2 = dot(z - r2, z - r2), d3 = dot(z - r3, z - r3);
        float dm = min(d1, min(d2, d3));
        if (dm < 1e-6) {
            which = d1 == dm ? 0.0 : d2 == dm ? 1.0 : 2.0;
            n += 1.0 - clamp(log(max(dm, 1e-12) / 1e-6) / log(1e-12 / 1e-6), 0.0, 1.0);
            break;
        }
        n += 1.0;
    }
    float g = pow(clamp(n / 16.0, 0.0, 1.0), 1.3) * lightK;
    vec3 col = famLight(fh, 0.2 + 0.3 * which, 0.35 * g) * g;
    col += famCol(fh, 0.5) * 0.012;
    finish(col);
}
