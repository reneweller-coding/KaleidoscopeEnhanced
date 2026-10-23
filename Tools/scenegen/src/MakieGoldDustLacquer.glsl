//@doc
 * @brief MAKI-E GOLD DUST LACQUER: maki-e: gold dust on lacquer, sprinkled in layers and lacquered over; the photo appears as dust whose density is its brightness, and the depth of the lacquer lets the dust clouds blur away in the dark.  Three layers lie at different depths: the nearest is sharp and
 * bright, the deeper ones are blurred and dim.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the depth of the lacquer (how far the deep layers are blurred)
 *   audioAdvance -> the dust drifts slowly (integrated)
 *
 * Knobs: sizeP (the grain of the dust), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
vec3 dustLayer(vec2 fc, float px, float G, float blur, float seed, vec2 drift, vec3 tint)
{
    vec2 g = (fc + drift) / (G * px);
    vec2 ci = floor(g);
    vec2 f = fract(g) - 0.5;
    float hh = hash21(ci + seed);
    vec2 jit = (hash22(ci + seed + 3.0) - 0.5) * 0.5;
    float d = length(f - jit);
    vec2 pc = (ci + 0.5) * G * px - drift;
    vec3 c = imgLod((pc - 0.5 * resolution) / resolution.y * 0.85 + 0.5, 1.0 + blur);
    float l = luma(c);
    float on = smoothstep(hh - 0.05, hh + 0.05, l * l * l * 1.15);
    float rr = 0.2 + 0.2 * hash21(ci + seed + 9.0);
    float disc = 1.0 - smoothstep(rr * (1.0 + 0.3 * blur), rr * (1.0 + 0.3 * blur) + 0.12 + 0.2 * blur, d);
    return tint * mix(vec3(1.0), c * 1.4, 0.3) * on * disc;
}
void main()
{
    vec2 fc = gl_FragCoord.xy;
    float px = resolution.y / 270.0;
    float G = 2.2 + 2.0 * clamp(sizeP, 0.0, 1.0);
    float depth = 0.5 + 0.5 * clamp(audioSwell, 0.0, 1.0);
    vec2 dr = vec2(0.3, 0.1) * (0.04 * audioAdvance + 0.05 * sceneTime) * px;
    vec3 gold = vec3(1.0, 0.8, 0.4);
    vec3 col = vec3(0.025, 0.012, 0.01);
    vec2 uv = (fc - 0.5 * resolution) / resolution.y;
    col += vec3(0.06, 0.02, 0.01) * smoothstep(0.7, 0.0, length(uv + vec2(0.2, -0.2)));
    col += dustLayer(fc, px, G * 1.6, 2.0 * depth, 31.0, dr * 0.4, gold * 0.35);
    col += dustLayer(fc, px, G * 1.3, 1.0 * depth, 17.0, dr * 0.7, gold * 0.6);
    col += dustLayer(fc, px, G, 0.0, 5.0, dr, gold * 1.3);
    finish(col);
}
