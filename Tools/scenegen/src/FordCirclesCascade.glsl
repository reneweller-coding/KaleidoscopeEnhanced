//@doc
 * @brief FORD CIRCLES CASCADE: above every fraction p/q stands a circle of diameter 1/q^2 touching the real line --
 * Ford's circles, which touch but never overlap, a rain of circles growing ever denser toward the line.  The view
 * flows toward the golden ratio along a hyperbolic motion of the modular group: after one period the picture is
 * the same set of circles again, so the cascade falls forever without a seam.  Mirrored about the real line; each
 * circle shows the photo, tinted by its denominator.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the flow toward the golden ratio (integrated)
 *   audioMelodyPitch -> a melody note lights the circles whose fraction is nearest its pitch (light)
 *   audioSwell      -> the circles' rims thicken
 *   audioKick       -> the rims flash (light)
 *
 * Knobs: speedP (the flow's speed), viewP (how wide the view), photoP (photo share), hueP.
//@params speedP viewP photoP
//@audio audioSwell audioKick audioMelodyPitch
//@body
/**  Complex division.
 *
 * @param a  The numerator. (in)
 * @param b  The denominator. (in)
 *
 * @return
 *   a / b.
 **/
vec2 cdivF(vec2 a, vec2 b) { return vec2(a.x * b.x + a.y * b.y, a.y * b.x - a.x * b.y) / max(dot(b, b), 1e-12); }

void main()
{
    vec2 p = screenP();
    const float phi = 1.6180340, phiC = -0.6180340;             // the fixed points of z -> (2z + 1) / (z + 1)
    float wide = 0.25 + 0.5 * clamp(viewP, 0.0, 1.0);
    vec2 w = vec2(phi + p.x * wide, abs(p.y) * wide + 1e-4);    // the view near phi, mirrored about the real line
    // the hyperbolic flow: in u = (z - phi) / (z - phi'), the map acts as u -> phi^-4 u; a fraction t of it
    float t = fract((0.03 + 0.08 * clamp(speedP, 0.0, 1.0)) * sceneTime + 0.01 * audioAdvance);
    vec2 u = cdivF(w - vec2(phi, 0.0), w - vec2(phiC, 0.0)) * exp(4.0 * log(phi) * t);
    vec2 z = cdivF(vec2(phi, 0.0) - phiC * u, vec2(1.0, 0.0) - u);
    // reduce z by the modular group, keeping the matrix: the cusp p/q whose horocycle (Ford circle) holds z
    float a = 1.0, b = 0.0, c = 0.0, d = 1.0;                   // z0 = (a z + b) / (c z + d) as we go
    vec2 zz = z;
    for (int i = 0; i < 40; ++i) {
        float n = floor(zz.x + 0.5);
        zz.x -= n;                                              // z -> z - n
        a -= n * c; b -= n * d;
        if (dot(zz, zz) >= 1.0) break;
        zz = cdivF(vec2(-1.0, 0.0), zz);                        // z -> -1 / z
        float a2 = -c, b2 = -d;
        c = a; d = b; a = a2; b = b2;
    }
    // zz = M z with M = [[a, b], [c, d]]: z sits in the Ford circle of the cusp M^-1(inf) = -d / c when Im zz > 1
    float qd = abs(c), pn = -d * sign(c + 1e-9);
    bool inside = zz.y > 1.0;
    float rim = inside ? smoothstep(1.0, 1.0 + 0.05 + 0.15 * clamp(audioSwell, 0.0, 1.0), zz.y) : 0.0;
    float qq = max(qd, 1.0);
    vec2 uv = vec2(zz.x * 0.5 + 0.5, 1.0 / zz.y);
    vec3 photo = imgLod(uv * vec2(1.0, 0.8) + vec2(fract(pn / qq * 3.7), 0.1), 0.5);
    vec3 tone = imgPalette(fract(log2(qq) * 0.23) + 0.03 * audioPhase);
    float note = exp(-pow((fract(pn / qq) - clamp(audioMelodyPitch, 0.0, 1.0)) * 40.0, 2.0));
    vec3 col = inside ? mix(tone * 1.1, photo, 0.4 + 0.5 * clamp(photoP, 0.0, 1.0)) * (0.5 + 0.6 * rim) : imgLod(p * 0.7 + 0.5, 3.0) * 0.08;
    col += inside ? mix(tone, vec3(1.0), 0.5) * ((1.0 - rim) * (0.4 + 0.6 * clamp(audioKick, 0.0, 1.0)) + 0.5 * note) : vec3(0.0);
    finish(col);
}
