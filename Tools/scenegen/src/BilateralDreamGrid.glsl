//@doc
 * @brief BILATERAL DREAM GRID: the photo melting into flat washes of colour and crystallising back -- a bilateral filter
 * that averages each point with its neighbours only where their colours are alike, so the surfaces flow together
 * while the edges hold.  How far it reaches and how alike the colours must be wander across the frame in slow
 * swells, so the picture dissolves in some places while it sharpens in others, and the whole drifts.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> how far the smoothing reaches
 *   audioAdvance    -> the swells of smoothing travel and the photo drifts (integrated)
 *
 * Knobs: reachP (the base reach), toleranceP (how unlike colours may still merge), photoP (photo share), hueP.
//@params reachP toleranceP photoP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    vec2 drift = 0.04 * vec2(sin(0.015 * sceneTime + 0.01 * audioAdvance), cos(0.012 * sceneTime));
    vec2 uv = p * 0.5 + 0.5 + drift;
    float swellF = fbm(p * 1.8 + vec2(0.04 * sceneTime + 0.03 * audioAdvance, -0.03 * sceneTime));
    float reach = (0.007 + 0.012 * clamp(reachP, 0.0, 1.0)) * (0.5 + 1.2 * clamp(audioSwell, 0.0, 1.0)) * (0.4 + 1.4 * swellF);
    float tol = (0.12 + 0.3 * clamp(toleranceP, 0.0, 1.0)) * (0.5 + swellF);
    vec3 c0 = imgLod(uv, 0.3);
    vec3 num = vec3(0.0);
    float den = 0.0;
    for (int j = -3; j <= 3; ++j) for (int i = -3; i <= 3; ++i) {
        vec2 o = vec2(float(i), float(j));
        float ws = exp(-dot(o, o) / 6.0);
        vec3 c = imgLod(uv + o * reach, 1.5);
        vec3 dc = c - c0;
        float w = ws * exp(-dot(dc, dc) / (tol * tol));
        num += c * w;
        den += w;
    }
    vec3 col = num / max(den, 1e-5);
    col = mix(col, c0, 0.15 * clamp(photoP, 0.0, 1.0));
    finish(col * 1.05);
}
