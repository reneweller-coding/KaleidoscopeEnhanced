//@doc
 * @brief WALKING DROPLET PILOT WAVES: walking droplets: an oil drop that bounces on a vibrating liquid follows its own wave (the double-slit pattern on a large scale); the picture shows droplet paths over wave fields, and the wave acts back on the path.  Five drops run on slow looping paths; each leaves a ring wave
 * at every earlier place (sixteen past places), the waves decay with age, and the photo under the water is bent by the sum.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the vibration strength: the waves' amplitude
 *   audioHarmAdvance -> the wavelength glides (integrated)
 *
 * Knobs: sizeP (the size of the drops), hueP.
//@params sizeP
//@audio audioSwell audioHarmAdvance
//@body
vec2 dpath(float k, float t)
{
    vec2 h = hash22(vec2(k, 9.0));
    return vec2(0.55 * sin(0.4 * t * (0.6 + h.x) + 6.28 * h.y) + 0.12 * sin(1.3 * t + 3.0 * h.x),
                0.32 * sin(0.33 * t * (0.6 + h.y) + 6.28 * h.x) + 0.08 * cos(1.1 * t + 3.0 * h.y)) * vec2(1.4, 1.0);
}
void main()
{
    vec2 p = screenP();
    float lam = 0.07 + 0.03 * sin(0.04 * audioHarmAdvance + 0.02 * sceneTime);
    float kw = 6.2831853 / lam;
    float amp = 0.4 + 0.9 * clamp(audioSwell, 0.0, 1.0);
    float t = sceneTime;
    vec2 grad = vec2(0.0);
    float hgt = 0.0;
    float drops = 0.0;
    float rad = 0.012 + 0.012 * clamp(sizeP, 0.0, 1.0);
    for (int k = 0; k < 5; ++k) {
        float fk = float(k);
        for (int m = 0; m < 14; ++m) {
            float age = float(m) * 0.45;
            vec2 c = dpath(fk, t - age);
            vec2 d = p - c;
            float r = length(d) + 1e-3;
            float w = exp(-0.22 * float(m)) * amp / (r * 3.0 + 0.5);
            float ph = kw * r - 2.0 * age;
            hgt += w * cos(ph);
            grad += w * (-sin(ph) * kw) * d / r;
        }
        vec2 d0 = p - dpath(fk, t);
        drops += exp(-dot(d0, d0) / (rad * rad));
    }
    vec2 uv = p * 0.85 + 0.5 + grad * 0.0006;
    vec3 c = imgLod(uv, 0.5);
    c *= 0.8 + 0.25 * hgt;
    vec3 col = c * 1.1 + vec3(1.0, 0.95, 0.85) * pow(max(0.0, 1.0 - length(grad) * 0.004), 8.0) * 0.0;
    col += vec3(1.0, 0.9, 0.7) * drops * 0.9;
    finish(col);
}
