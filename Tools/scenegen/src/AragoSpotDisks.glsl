//@doc
 * @brief ARAGO SPOT DISKS: a field of opaque discs in front of the photo; inside each disc's shadow a diffraction pattern of
 * rings with the bright Poisson spot in the middle, through which the photo seems to look, and a faint ring system around each disc
 * on the lit photo.  The discs drift and change size.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the discs' radius
 *   audioSpread     -> the number of rings in the pattern
 *   audioAdvance    -> the discs' drift (integrated)
 *
 * Knobs: sizeP (the base size), densityP (how many discs), hueP.
//@params sizeP densityP
//@audio audioSwell audioSpread
//@body
/**  The zeroth Bessel function J0 (the Poisson spot's profile), by a series near zero and its asymptote beyond.
 *
 * @param x  The argument. (in)
 *
 * @return
 *   J0(x).
 **/
float besselJ0(float x)
{
    x = abs(x);
    if (x < 2.5) { float y = x * x * 0.25; return 1.0 - y + y * y * 0.25 - y * y * y / 36.0 + y * y * y * y / 576.0; }
    return sqrt(2.0 / (3.14159265 * x)) * cos(x - 0.7853982);
}
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float t = sceneTime * 0.3 + 2.0 * audioAdvance;
    float cell = 0.5 - 0.22 * clamp(densityP, 0.0, 1.0);
    vec2 q = p / cell + 0.05 * t * vec2(0.8, 0.6);
    vec2 g = floor(q);
    float best = 9.0;
    vec2 cc = vec2(0.0);
    float rr = 0.0;
    for (int j = -1; j <= 1; ++j) {
        for (int i = -1; i <= 1; ++i) {
            vec2 cg = g + vec2(float(i), float(j));
            vec2 pt = cg + 0.2 + 0.6 * hash22(cg);
            float d = length(q - pt);
            if (d < best) { best = d; cc = pt; rr = 0.18 + 0.2 * hash21(cg + 7.0); }
        }
    }
    float R = rr * (0.7 + 0.9 * clamp(sizeP, 0.0, 1.0)) * (0.7 + 0.5 * clamp(audioSwell, 0.0, 1.0));
    float k = 5.0 + 14.0 * clamp(audioSpread, 0.0, 1.0);
    vec3 c = imgLod(uv, 0.5);
    float j0 = besselJ0(k * best);
    vec3 col;
    if (best < R) col = c * (0.12 + 0.95 * j0 * j0 * smoothstep(R, R * 0.4, best) + 0.15);
    else col = c * (1.0 + 0.18 * cos(k * (best - R) * 2.0) * exp(-(best - R) * 3.0 / R));
    finish(col);
}
