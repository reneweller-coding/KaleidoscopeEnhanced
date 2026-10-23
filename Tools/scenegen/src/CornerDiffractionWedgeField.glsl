//@doc
 * @brief CORNER DIFFRACTION WEDGE FIELD: diffraction at an edge: a wave meets an edge, and behind the edge a border of stripes arises; the picture shows many edges at which waves are diffracted, with the photo in the shadow.  Three half planes lie at different angles; the field behind and beside each is the Fresnel edge
 * pattern (oscillating on the lit side, a soft fall in the shadow), and the product of the three is taken.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread  -> the wavelength (the width of the stripes) (smoothed)
 *   audioAdvance -> the edges wander (integrated)
 *
 * Knobs: sizeP (the distance from the edge), hueP.
//@params sizeP
//@audio audioSpread audioAdvance
//@body
float edgeI(float u)
{
    float a = abs(u);
    float lit = 1.0 + 1.4142 / (3.1415927 * max(u, 0.2)) * sin(1.5707963 * u * u + 0.7853982);
    float sh = 1.0 / (2.0 * 9.8696 * max(a, 0.3) * max(a, 0.3) + 0.5);
    float s = smoothstep(-0.3, 0.3, u);
    return mix(sh * 2.5, lit, s) * 0.5 * (1.0 + 0.0);
}
void main()
{
    vec2 p = screenP();
    float lam = 0.02 + 0.04 * clamp(audioSpread, 0.0, 1.0);
    float z = 0.5 + 1.5 * clamp(sizeP, 0.0, 1.0);
    float t = 0.01 * audioAdvance + 0.015 * sceneTime;
    float I = 0.0;
    float sh = 1.0;
    for (int k = 0; k < 3; ++k) {
        float fk = float(k);
        float ang = 0.9 + 2.1 * fk + 0.6 * sin(t * (1.0 + 0.4 * fk) + fk);
        vec2 n = vec2(cos(ang), sin(ang));
        float off = 0.12 * sin(t * 2.0 + 2.0 * fk);
        float u = (dot(p, n) - off) / sqrt(lam * z * 0.6) * 1.0;
        float v = edgeI(-u);
        I += clamp(v, 0.0, 1.7) / 3.0;
    }
    vec3 c = imgLod(p * 0.85 + 0.5, 0.8);
    c = mix(vec3(luma(c)), c, 1.3);
    float lit = clamp(I, 0.0, 1.6);
    vec3 col = c * (0.04 + 1.15 * lit) + c * 0.06 * (1.0 - smoothstep(0.0, 0.5, lit));
    finish(col * 1.1);
}
