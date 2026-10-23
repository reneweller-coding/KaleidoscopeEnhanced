//@doc
 * @brief SHEAR BAND LOCALISATION FRONTS: shear bands in granular matter: under shearing the deformation collects in thin bands that branch and wander; the photo becomes fields of plates that slip against each other along the bands.  Two families of bands (at different angles, mixed by a slow noise mask)
 * cut the picture into plates; every plate slides along its band at its own slow speed, and the bands are thin dark lines.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the shear rate: the sliding speeds
 *   audioSpread  -> the width of the plates (smoothed)
 *
 * Knobs: sizeP (the number of bands), hueP.
//@params sizeP
//@audio audioSwell audioSpread
//@body
void main()
{
    vec2 p = screenP();
    float N = 7.0 + 8.0 * clamp(sizeP, 0.0, 1.0) + 3.0 * clamp(audioSpread, 0.0, 1.0);
    float sp = 0.01 + 0.04 * clamp(audioSwell, 0.0, 1.0);
    float t = sceneTime + 0.5 * 0.0;
    float mask = smoothstep(0.35, 0.65, fbm(p * 1.5 + vec2(0.0, 0.02 * t)));
    vec2 q = p;
    float shade = 1.0;
    for (int f = 0; f < 2; ++f) {
        float ang = f == 0 ? 0.6 : -0.45;
        vec2 ax = vec2(cos(ang), sin(ang));
        vec2 nx = vec2(-ax.y, ax.x);
        float b = dot(p, nx) * N + 0.5 * fbm(p * 3.0 + float(f) * 5.0);
        float k = floor(b);
        float fb = fract(b);
        float h = hash21(vec2(k, float(f) * 7.0));
        float vel = (h - 0.5) * 2.0 * sp * (0.3 * sceneTime + 3.0);
        float wgt = f == 0 ? mask : 1.0 - mask;
        q += ax * vel * wgt;
        shade *= 1.0 - 0.5 * wgt * (1.0 - smoothstep(0.0, 0.05, min(fb, 1.0 - fb)));
    }
    vec3 c = imgLod(q * 0.85 + 0.5, 0.6);
    finish(c * (0.4 + 0.6 * shade) * 1.1);
}
