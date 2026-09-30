//@doc
 * @brief TEXTURE RIPPLE INTERFERENCE: raindrops falling on a still pond over
 * a picture -- from every drop a train of rings spreads out, the rings
 * cross each other and form shimmering interference patterns, and through
 * the moving surface the photograph on the bottom wobbles and bends,
 * while the rings catch a bright sky reflection on their crests; drops
 * keep falling at wandering places.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the rings travel (integrated, jump-free)
 *   audioSpread     -> ring height
 *   audioKick       -> the crests flash (light)
 *   audioMode       -> the sky: cool in minor, warm evening in major
 *   audioRoughness  -> ring wavelength gets finer
 *   audioSwell      -> the pond darkens and reflects more (slow)
 *
 * Knobs: dropP (drop density), refractP (bending of the photo), skyP (sky reflection), hueP.
//@params dropP refractP skyP
//@audio audioSpread audioKick audioMode audioRoughness audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    float S = 1.5 + 1.5 * clamp(dropP, 0.0, 1.0);
    vec2 g = p * S;
    vec2 gi = floor(g);
    float k = (40.0 + 40.0 * rough) / S;                        // wave number (per cell unit)
    float T = 0.25 * sceneTime + 1.5 * audioAdvance;
    vec2 grad = vec2(0.0);
    float hsum = 0.0;
    for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
        vec2 id = gi + vec2(i, j);
        for (int n = 0; n < 2; ++n) {
            float fn = float(n);
            float h = hash21(id + fn * 7.0);
            float cyc = T * (0.5 + 0.5 * h) + h * 5.0 + fn * 0.5;
            float age = fract(cyc);
            float gen = floor(cyc);
            vec2 c = id + 0.15 + 0.7 * hash22(id + gen * 1.37 + fn * 3.0);
            vec2 d = g - c;
            float r = length(d) + 1e-4;
            float front = age * 1.4;                            // the ring train's leading edge
            float env = exp(-pow((r - front * 0.7) / 0.35, 2.0)) * smoothstep(front + 0.05, front - 0.1, r);
            float amp = env * (1.0 - age) * smoothstep(0.0, 0.05, age) / (1.0 + r * 3.0);
            float ph = k * (r - front);
            hsum += amp * sin(ph);
            grad += amp * k * cos(ph) * d / r;
        }
    }
    float a = 0.02 + 0.03 * clamp(audioSpread, 0.0, 1.0);
    grad *= a;
    // The photo on the pond bottom, refracted by the surface slope.
    vec2 uv = p * 0.6 + 0.5 + grad * (0.15 + 0.4 * clamp(refractP, 0.0, 1.0)) / S + vec2(0.002, 0.001) * sceneTime;
    vec3 bottom = imgLod(uv, 0.8) * (0.85 - 0.35 * swell);
    // Sky reflection on the slopes facing the light.
    vec3 sky = mix(vec3(0.6, 0.75, 0.95), vec3(1.0, 0.75, 0.5), mode);
    sky = mix(sky, glowColour(imgLod(vec2(0.5), 6.0), p, hueP * 0.159), 0.2);
    float fres = 0.05 + 0.3 * swell + 0.6 * clamp(length(grad) * 2.0, 0.0, 1.0);
    float crest = pow(max(0.0, dot(normalize(vec3(-grad, 1.0)), normalize(vec3(-0.4, 0.5, 0.75)))), 60.0);
    vec3 col = mix(bottom, sky * 0.7, fres * (0.3 + 0.7 * clamp(skyP, 0.0, 1.0)));
    col += vec3(1.0, 0.97, 0.92) * crest * (0.3 + 1.2 * kick);
    finish(col);
}
