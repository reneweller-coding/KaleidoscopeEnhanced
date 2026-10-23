//@doc
 * @brief NOVA FRACTAL RELAXATION PHOTO: the Nova fractal: Newton's method with relaxation, in which basins of attraction and Julia-like spirals mix; the photo sets the colour of the basins, and the relaxation parameter glides.  The iteration z -> z - R (z^3 - 1) / (3 z^2) + c is run twenty-four times from the point under
 * every pixel; the photo is read at the final point, tinted by the root it fell to.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the relaxation parameter R glides
 *   audioAdvance -> the picture drifts through the parameter plane (integrated)
 *
 * Knobs: sizeP (the zoom), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
/**  The product of two complex numbers.
 *
 * @param a  The first argument. (in)
 * @param b  The second argument. (in)
 *
 * @return
 *   The product.
 **/
vec2 cm(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
/**  The quotient of two complex numbers (safe against zero).
 *
 * @param a  The first argument. (in)
 * @param b  The second argument. (in)
 *
 * @return
 *   The quotient.
 **/
vec2 cd(vec2 a, vec2 b) { return vec2(a.x * b.x + a.y * b.y, a.y * b.x - a.x * b.y) / (dot(b, b) + 1e-6); }
void main()
{
    vec2 z = screenP() * (1.4 + 1.2 * (1.0 - clamp(sizeP, 0.0, 1.0)));
    float R = 1.0 + 0.25 * sin(0.05 * sceneTime) + 0.25 * clamp(audioSwell, 0.0, 1.0);
    vec2 c = vec2(0.0, 0.0) + 0.03 * vec2(sin(0.02 * audioAdvance + 0.03 * sceneTime), cos(0.017 * audioAdvance));
    float it = 0.0;
    for (int i = 0; i < 24; ++i) {
        vec2 z2 = cm(z, z);
        vec2 z3 = cm(z2, z);
        vec2 num = z3 - vec2(1.0, 0.0);
        vec2 den = 3.0 * z2;
        z = z - R * cd(num, den) + c;
        z = clamp(z, vec2(-6.0), vec2(6.0));
        if (dot(z - vec2(1.0, 0.0), z - vec2(1.0, 0.0)) < 1e-6) { it = float(i); break; }
        it = float(i);
    }
    float root = atan(z.y, z.x);
    vec3 c0 = imgLod(screenP() * 0.85 + 0.5, 0.8);
    c0 = mix(vec3(luma(c0)), c0, 1.3);
    vec3 tint = 0.7 + 0.5 * cos(vec3(0.0, 2.1, 4.2) + root * 1.0);
    float shade = 0.6 + 0.4 * (1.0 - it / 24.0);
    finish(c0 * mix(vec3(1.0), tint, 0.5) * shade * 1.25);
}
