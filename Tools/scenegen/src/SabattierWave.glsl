//@doc
 * @brief SABATTIER WAVE: a wave of partial tone reversal (solarisation) runs across the photo: where the wave is, the tones above a
 * moving threshold fold back on themselves and the brightness turns negative while the hue stays, and along the edges of the
 * reversed regions the bright Mackie lines stand, made by the effect itself.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the threshold of the reversal and the wave's depth
 *   audioPhase      -> the wave's travel (integrated)
 *
 * Knobs: waveP (the wave's length), depthP (the base depth of the reversal), hueP.
//@params waveP depthP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float t = sceneTime * 0.5 + 3.0 * audioPhase;
    float k = 1.5 + 2.5 * clamp(waveP, 0.0, 1.0);
    float wave = 0.5 + 0.5 * sin(k * (p.x + 0.6 * p.y) - 0.6 * t);
    float depth = (0.5 + 0.5 * clamp(depthP, 0.0, 1.0)) * (0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0));
    float th = 0.62 - 0.25 * wave * depth;
    vec3 c = imgLod(uv, 0.4);
    float L = luma(c);
    float Lr = L < th ? L : th - (L - th) * 0.7;
    float Lb = luma(imgLod(uv, 2.0));
    float Lbr = Lb < th ? Lb : th - (Lb - th) * 0.7;
    float mackie = smoothstep(0.0, 0.06, abs(Lr - Lbr)) * smoothstep(0.1, 0.0, abs(L - th) - 0.02 + 0.2 * (1.0 - wave));
    vec3 col = c * (clamp(Lr, 0.18, 1.2) / max(L, 0.08));
    col = mix(c, col, smoothstep(0.1, 0.5, wave * depth + 0.2));
    col += 0.35 * mackie * vec3(1.0, 0.96, 0.9) * wave;
    finish(col);
}
