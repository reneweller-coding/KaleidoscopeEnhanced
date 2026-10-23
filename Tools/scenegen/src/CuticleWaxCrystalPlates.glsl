//@doc
 * @brief CUTICLE WAX CRYSTAL PLATES: wax crystals on leaves: plates and tubes cover the surface and scatter the light (the lotus effect); the photo lies underneath, and the plates tilt slightly with a wandering light source.  Two layers of small oval plates with random orientation and tilt, each flashing as the
 * light passes its normal, over the photo that shows through the gaps.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the light source wanders (integrated)
 *   audioSpread  -> the size of the plates (smoothed)
 *
 * Knobs: sizeP (the size of the plates), hueP.
//@params sizeP
//@audio audioSpread audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    vec3 base = imgLod(p * 0.85 + 0.5, 0.6);
    vec3 col = base * 0.55;
    float la = 0.04 * audioAdvance + 0.05 * sceneTime;
    vec3 L = normalize(vec3(0.7 * cos(la), 0.5 * sin(1.3 * la), 0.55));
    for (int layer = 0; layer < 2; ++layer) {
        float S = (0.032 + 0.02 * clamp(sizeP, 0.0, 1.0) + 0.01 * clamp(audioSpread, 0.0, 1.0)) * (layer == 0 ? 1.0 : 1.45);
        vec2 off = vec2(0.37 * float(layer), 0.21 * float(layer));
        vec2 g = p / S + off;
        vec2 gi = floor(g);
        for (int dy = -1; dy <= 1; ++dy)
            for (int dx = -1; dx <= 1; ++dx) {
                vec2 cj = gi + vec2(float(dx), float(dy));
                vec2 h = hash22(cj + float(layer) * 13.0);
                vec2 cen = cj + 0.5 + 0.35 * (h - 0.5) * 2.0;
                float ang = 6.2831853 * h.y;
                vec2 q = rot2(ang) * (g - cen);
                float e = (q.x / 0.62) * (q.x / 0.62) + (q.y / 0.34) * (q.y / 0.34);
                if (e < 1.0) {
                    vec3 n = normalize(vec3(0.55 * (h - 0.5) * 2.0, 1.0 - 0.5 * e));
                    float spec = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 14.0);
                    float dif = 0.5 + 0.5 * max(dot(n, L), 0.0);
                    vec3 pc = mix(base, vec3(0.9, 0.95, 0.9), 0.35) * dif + spec * 0.9;
                    float rim = smoothstep(1.0, 0.8, e);
                    col = mix(col, pc, rim * 0.75);
                }
            }
    }
    finish(col * 1.15);
}
