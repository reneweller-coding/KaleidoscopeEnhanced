//@doc
 * @brief HAIR CELL BUNDLE BLOOM: the field of hair cells: thousands of stereocilia in three rows that tilt with the sound pressure, a carpet of hair tufts over the photo that sway with the wave.  Each tuft is three hairs in a row of rising height; the tilt runs as a wave over the whole carpet.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the tilt of the hairs
 *   audioAdvance -> the wave runs over the carpet (integrated)
 *
 * Knobs: sizeP (the size of the tufts), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 fc = gl_FragCoord.xy;
    float px = resolution.y / 270.0;
    float S = (12.0 + 12.0 * clamp(sizeP, 0.0, 1.0)) * px;
    vec2 g = fc / S;
    vec2 ci = floor(g);
    vec3 floorc = imgLod((fc - 0.5 * resolution) / resolution.y * 0.85 + 0.5, 0.8) * 0.45;
    vec3 col = floorc;
    float tilt = 0.3 + 0.8 * clamp(audioSwell, 0.0, 1.0);
    float acc = 0.0;
    vec3 hc = vec3(0.0);
    for (int dy = -1; dy <= 2; ++dy)
        for (int dx = -1; dx <= 1; ++dx) {
            vec2 cj = ci + vec2(float(dx), float(dy));
            vec2 h = hash22(cj);
            vec2 base = (cj + 0.2 + 0.6 * h) * S;
            float wv = sin(0.012 * base.x / px * 6.0 + 0.9 * sin(0.01 * base.y / px) - 0.05 * audioAdvance - 0.1 * sceneTime);
            for (int r = 0; r < 3; ++r) {
                float fr = float(r);
                vec2 b = base + vec2(0.0, (fr - 1.0) * S * 0.18);
                float len = S * (0.55 + 0.25 * fr);
                vec2 tip = b + vec2(wv * tilt * len * 0.7, len * (1.0 - 0.2 * abs(wv) * tilt));
                float d = sdSeg(fc, b, tip) / px;
                float w = 1.0 - smoothstep(0.5, 1.4, d);
                vec3 c = imgLod((tip - 0.5 * resolution) / resolution.y * 0.85 + 0.5, 1.0);
                float t = clamp(dot(fc - b, tip - b) / max(dot(tip - b, tip - b), 1e-3), 0.0, 1.0);
                hc += c * w * (0.5 + 1.1 * t);
                acc += w;
            }
        }
    col = mix(col, hc / max(acc, 1.0) * 1.2, clamp(acc, 0.0, 1.0));
    finish(col);
}
