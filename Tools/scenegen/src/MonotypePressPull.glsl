//@doc
 * @brief MONOTYPE PRESS PULL: monotype: paint on a plate, a sheet laid on and peeled off; the paint branches into fine fingers as it is peeled; the photo lies as the painting, and the peeling front wanders.  A front sweeps across the picture; behind it the paint is torn into viscous fingers (ridged noise stretched
 * across the front), ahead of it lies the wet, whole photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the pulling speed: the width of the zone of fingers
 *   audioAdvance -> the front sweeps (integrated)
 *
 * Knobs: sizeP (the fineness of the fingers), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    float ang = 0.35 * sin(0.015 * audioAdvance + 0.02 * sceneTime) + 0.3;
    vec2 ax = vec2(cos(ang), sin(ang));
    vec2 nx = vec2(-ax.y, ax.x);
    float cyc = fract(0.012 * audioAdvance + 0.02 * sceneTime);
    float front = (cyc * 1.4 - 0.7) * asp * 0.8;
    float u = dot(p, ax) - front;
    float v = dot(p, nx);
    float zone = 0.12 + 0.3 * clamp(audioSwell, 0.0, 1.0);
    float fs = 5.0 + 22.0 * clamp(sizeP, 0.0, 1.0);
    float f = 1.0 - abs(fbm(vec2(v * fs, u * fs * 0.15 + 3.0)) - 0.5) * 2.0;
    float f2 = noise2(vec2(v * fs * 3.0, u * 4.0));
    float peeled = smoothstep(0.0, 0.05, -u);
    float depth = clamp(-u / zone, 0.0, 1.5);
    float thr = mix(0.25, 0.85, clamp(depth, 0.0, 1.0));
    float keep = smoothstep(thr + 0.1, thr - 0.02, f * 0.8 + f2 * 0.3);
    vec3 c = imgLod(p * 0.85 + 0.5, 0.8);
    c = mix(vec3(luma(c)), c, 1.3);
    vec3 paper = vec3(0.95, 0.93, 0.88);
    vec3 wet = c * (1.0 + 0.1 * exp(-abs(u) * 20.0));
    vec3 torn = mix(paper, c * 1.1, mix(1.0, keep, peeled));
    float front_line = exp(-pow(u / 0.01, 2.0));
    finish(mix(wet, torn, peeled) + vec3(1.0) * front_line * 0.15);
}
