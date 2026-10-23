//@doc
 * @brief FRESNEL EDGE FRINGES: every strong edge of the photo diffracts light: behind it fine fringes run off, closer toward the dark side and
 * overshooting, like the light behind a razor blade, so the picture looks drawn over in stripes.  The fringes' distance is
 * estimated from the edge's gradient; the photo's colours stay.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread     -> the fringes' wavelength
 *   audioSwell      -> their strength
 *   audioAdvance    -> the fringes drift away from the edges (integrated)
 *
 * Knobs: reachP (how far the fringes reach), hueP.
//@params reachP
//@audio audioSpread audioSwell
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float t = sceneTime * 0.3 + 2.0 * audioAdvance;
    vec3 c = imgLod(uv, 0.4);
    float e = 0.01;
    float L0 = luma(imgLod(uv, 1.5));
    vec2 g = vec2(luma(imgLod(uv + vec2(e, 0.0), 1.5)) - luma(imgLod(uv - vec2(e, 0.0), 1.5)),
                  luma(imgLod(uv + vec2(0.0, e), 1.5)) - luma(imgLod(uv - vec2(0.0, e), 1.5))) / (2.0 * e);
    float gm = length(g);
    float Lb = luma(imgLod(uv, 3.5));
    float d = (L0 - Lb) / max(gm, 0.15);
    float lam = 0.03 + 0.05 * (1.0 - clamp(audioSpread, 0.0, 1.0));
    float reach = 0.04 + 0.12 * clamp(reachP, 0.0, 1.0);
    float fr = sin(6.2831853 * (sqrt(abs(d) / lam) - 0.2 * t)) * exp(-abs(d) / reach);
    float amp = smoothstep(0.1, 0.8, gm) * (0.4 + 0.8 * clamp(audioSwell, 0.0, 1.0));
    vec3 col = c * (1.0 + 0.8 * amp * fr);
    finish(col);
}
