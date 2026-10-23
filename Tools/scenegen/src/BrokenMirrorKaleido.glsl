//@doc
 * @brief BROKEN MIRROR KALEIDO: a kaleidoscope in which one mirror after another turns transparent: where a mirror is missing an unfolded sector remains, with the whole photo as it is, and the symmetry breaks open, the folded
 * and the free picture side by side in one rosette.  The missing mirror wanders round with the phase of the music, and how transparent it turns follows the swell.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> how transparent the missing mirror is
 *   audioPhase      -> the missing mirror wanders round (integrated)
 *
 * Knobs: sectorP (how many mirrors), hueP.
//@params sectorP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float n = 2.0 * floor(3.0 + 4.0 * clamp(sectorP, 0.0, 1.0));
    float r = length(p), a = atan(p.y, p.x) + 0.01 * sceneTime;
    float w = 6.2831853 / n;
    float k = floor(a / w);
    float fa = a - k * w;
    float fold = abs(fa - 0.5 * w);
    vec2 qf = r * vec2(cos(fold), sin(fold)) * 1.3;
    vec3 folded = imgLod(qf * 0.8 + 0.5, 0.7);
    vec3 free = imgLod(p * 0.8 + 0.5, 0.7);
    float m = 0.05 * audioPhase + 0.015 * sceneTime;
    float dk = abs(mod(k - n * fract(m / n * 1.0) + 0.5 * n, n) - 0.5 * n);
    float tr = smoothstep(1.4, 0.2, dk) * (0.55 + 0.45 * clamp(audioSwell, 0.0, 1.0));
    finish(mix(folded, free, tr) * 1.05);
}
