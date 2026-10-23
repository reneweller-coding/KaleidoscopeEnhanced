//@doc
 * @brief COSMATI STONE FLOOR: a Cosmati floor: marble in circles, guilloches and bands, with pieces of gold and glass; the photo gives the colour of the stones, and the circles and bands turn slowly against each other.  Every square holds a mosaic roundel of three rings of tesserae turning in opposite
 * directions, the corners hold straight bands, and the lime joints are pale.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell       -> the number of bands (the rings' fineness) glides
 *   audioAdvance     -> the roundels turn (integrated)
 *
 * Knobs: sizeP (the size of the squares), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float S = 0.3 + 0.25 * clamp(sizeP, 0.0, 1.0);
    vec2 q = p / S;
    vec2 ci = floor(q + 0.5);
    vec2 d = (q - ci) * S;
    float r = length(d) / (0.5 * S);
    float a = atan(d.y, d.x);
    float rot = 0.015 * audioAdvance + 0.012 * sceneTime;
    vec3 col;
    if (r < 0.92) {
        float ringw = 0.92 / 3.0;
        float ring = floor(r / ringw);
        float fr = fract(r / ringw);
        float N = 10.0 + 6.0 * ring + floor(4.0 * clamp(audioSwell, 0.0, 1.0));
        float dirr = mod(ring, 2.0) < 0.5 ? 1.0 : -1.0;
        float u = (a + dirr * rot * (1.0 + ring)) / 6.2831853 * N;
        float k = floor(u);
        float fk = fract(u);
        float ac = (k + 0.5) / N * 6.2831853 - dirr * rot * (1.0 + ring);
        vec2 cp = (ci * S) + (0.5 * S) * ((ring + 0.5) * ringw) * vec2(cos(ac), sin(ac));
        vec3 c = imgLod(cp * 0.85 + 0.5, 1.3);
        c = mix(vec3(luma(c)), c, 1.3);
        float gold = step(0.9, hash21(vec2(k, ring + ci.x * 3.0 + ci.y * 5.0)));
        c = mix(c, vec3(0.95, 0.75, 0.3), gold * 0.8);
        float edge = smoothstep(0.0, 0.1, fk) * (1.0 - smoothstep(0.9, 1.0, fk)) * smoothstep(0.0, 0.1, fr) * (1.0 - smoothstep(0.9, 1.0, fr));
        col = c * (0.45 + 0.65 * edge) + vec3(0.8, 0.77, 0.7) * (1.0 - edge) * 0.35;
    } else {
        float band = abs(fract((abs(d.x) + abs(d.y)) / (0.12 * S * 2.0) + 0.5 * rot) - 0.5);
        vec3 c = imgLod((ci * S + d) * 0.85 + 0.5, 1.5);
        float st = smoothstep(0.18, 0.22, band);
        col = mix(c * 0.5, vec3(0.85, 0.82, 0.75) * 0.8, st * 0.55);
        col *= 0.8 + 0.3 * hash21(floor(vec2(abs(d.x), abs(d.y)) / (0.08 * S)) + ci);
    }
    finish(col * 1.15);
}
