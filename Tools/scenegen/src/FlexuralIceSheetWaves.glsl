//@doc
 * @brief FLEXURAL ICE SHEET WAVES: bending waves of an ice sheet (omega proportional to k squared): the short waves run fast and ahead, the long ones slowly behind, so a disturbance fans out into a train of ever finer ripples; the ice
 * cracks where the bending is greatest, thin dark cracks that open and close; the photo lies under the ice, seen through and shifted by the waves.  The stiffness of the sheet follows the swell of the music.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the stiffness of the sheet (the speed of the short waves)
 *   audioAdvance    -> the waves run on (integrated)
 *
 * Knobs: crackP (how many cracks), hueP.
//@params crackP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float tt = 0.5 * sceneTime + 0.4 * audioAdvance;
    float stiff = 0.02 + 0.05 * clamp(audioSwell, 0.0, 1.0);
    vec2 D = vec2(0.0), G = vec2(0.0);
    float eta = 0.0;
    for (int i = 0; i < 32; ++i) {
        float fi = float(i);
        vec3 h = vec3(hash11(fi * 3.17 + 0.3), hash11(fi * 7.31 + 1.1), hash11(fi * 1.93 + 5.7));
        float k = 2.0 * exp(h.x * 3.0);
        float th = 6.2831853 * h.y;
        vec2 dir = vec2(cos(th), sin(th));
        float w = stiff * k * k;
        float ph = k * dot(p, dir) - w * tt + 6.2831853 * h.z;
        float a = 0.2 / pow(k, 0.9);
        D += a * dir * cos(ph);
        eta += a * k * k * sin(ph) * 0.12;
        G += a * k * dir * cos(ph);
    }
    float crackAmt = 0.4 + 1.2 * clamp(crackP, 0.0, 1.0);
    float crack = smoothstep(0.05 * crackAmt, 0.0, abs(eta));
    vec3 c = imgLod((p + D * 1.2) * 0.8 + 0.5, 0.8);
    vec3 ice = mix(c, vec3(0.85, 0.93, 1.0), 0.25);
    vec3 n = normalize(vec3(-G * 0.4, 1.0));
    float lam = clamp(dot(n, normalize(vec3(-0.3, 0.5, 0.8))), 0.0, 1.0);
    finish(ice * (0.6 + 0.55 * lam) * (1.0 - 0.7 * crack));
}
