//@doc
 * @brief CATS PAW WIND RIPPLE PATCHES: cat's paws on the water: gusts of wind ruffle patches of the surface that pass as dark paws over the smooth water; the photo lies under the water, more strongly refracted in the patches.  A drifting mask (clouds of noise) marks the gusts; inside, small ripples of the wind's direction
 * bend the photo; outside, the water is nearly smooth and mirrors the sky.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread  -> the size of the patches (smoothed)
 *   audioAdvance -> the gusts wander (integrated)
 *
 * Knobs: sizeP (the ripples' fineness), hueP.
//@params sizeP
//@audio audioSpread audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float t = 0.02 * audioAdvance + 0.03 * sceneTime;
    float sc = 1.2 + 1.8 * (1.0 - clamp(audioSpread, 0.0, 1.0));
    float m = fbm(p * sc + vec2(t * 2.0, t));
    float patch_ = smoothstep(0.5, 0.68, m);
    float k = 55.0 + 70.0 * clamp(sizeP, 0.0, 1.0);
    vec2 wd = vec2(cos(0.7), sin(0.7));
    float w1 = sin(k * dot(p, wd) - 9.0 * t) + 0.6 * sin(k * 1.37 * dot(p, vec2(cos(1.1), sin(1.1))) - 7.0 * t + 1.0) + 0.5 * sin(k * 0.8 * dot(p, vec2(cos(0.3), sin(0.3))) + 6.0 * t);
    vec2 grad = vec2(cos(0.7), sin(0.7)) * cos(k * dot(p, wd) - 9.0 * t) + 0.4 * vec2(cos(1.1), sin(1.1)) * cos(k * 1.37 * dot(p, vec2(cos(1.1), sin(1.1))) - 7.0 * t + 1.0);
    vec2 uv = p * 0.85 + 0.5 + patch_ * grad * 0.008 + 0.01 * (1.0 - patch_) * vec2(sin(1.5 * p.y + t), 0.0);
    vec3 c = imgLod(uv, 0.5);
    vec3 sky = mix(vec3(0.5, 0.65, 0.9), c, 0.3);
    vec3 smooth_ = mix(c * 0.85, sky, 0.45) * (0.9 + 0.1 * p.y);
    vec3 rough = c * (0.6 + 0.35 * w1 * 0.5 + 0.2);
    vec3 col = mix(smooth_, rough, patch_);
    finish(col * 1.1);
}
