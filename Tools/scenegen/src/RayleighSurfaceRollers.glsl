//@doc
 * @brief RAYLEIGH SURFACE ROLLERS: Rayleigh waves at a surface: the photo moves in rolling ellipses that go round backwards and die away with depth -- at the top of the picture, the surface, the waves are large and the photo rolls
 * round in tall ellipses, and toward the bottom the short waves vanish first and only the long ones are left; the waves run along the surface.  The depth they reach follows the spectral spread, the swell sets their height.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread     -> how deep the waves reach (more spread, shorter waves too)
 *   audioSwell      -> the height of the waves
 *   audioAdvance    -> the waves run along the surface (integrated)
 *
 * Knobs: waveP (the base size of the waves), hueP.
//@params waveP
//@audio audioSpread audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float tt = 0.5 * sceneTime + 0.4 * audioAdvance;
    float z = max(0.5 - p.y, 0.0);
    float A = (0.18 + 0.24 * clamp(waveP, 0.0, 1.0)) * (0.6 + 0.8 * clamp(audioSwell, 0.0, 1.0));
    float reach = 0.3 + 1.0 * (1.0 - clamp(audioSpread, 0.0, 1.0));
    vec2 D = vec2(0.0);
    for (int i = 0; i < 16; ++i) {
        float fi = float(i);
        vec3 h = vec3(hash11(fi * 3.17 + 0.3), hash11(fi * 7.31 + 1.1), hash11(fi * 1.93 + 5.7));
        float k = 2.0 * exp(h.x * 2.6);
        float w = 0.7 * k * (1.0 + 0.04 * k);
        float ph = k * p.x - w * tt + 6.2831853 * h.z;
        float a = A * exp(-k * z * reach) / (1.0 + 0.3 * k);
        D += a * vec2(-0.75 * cos(ph), sin(ph));
    }
    vec3 c = imgLod((p + D * 1.6) * 0.8 + 0.5, 0.7);
    float surf = smoothstep(0.0, 0.05, z) * 0.0 + 1.0;
    finish(c * (0.9 + 0.1 * exp(-z * 3.0)) * 1.05 * surf);
}
