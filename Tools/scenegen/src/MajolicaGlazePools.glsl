//@doc
 * @brief MAJOLICA GLAZE POOLS: majolica: tin glaze painted with metal oxides; in the firing the colours run into one another and collect in pools; the photo lies as the painting, its edges running softly.  The blur of every place is chosen by a slow field, so that colours pool where it is large; on top
 * lies a glassy gloss from a smooth height field.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> how far the colours run into one another
 *   audioRolloff -> the gloss of the glaze
 *
 * Knobs: sizeP (the size of the pools), hueP.
//@params sizeP
//@audio audioSwell audioRolloff
//@body
void main()
{
    vec2 p = screenP();
    float sc = 1.2 + 2.0 * (1.0 - clamp(sizeP, 0.0, 1.0));
    float t = 0.03 * sceneTime;
    vec2 w = vec2(fbm(p * sc + vec2(t, 0.0)), fbm(p * sc + vec2(4.0, -t))) - 0.5;
    float run = 0.3 + 0.7 * clamp(audioSwell, 0.0, 1.0);
    float pool = smoothstep(0.35, 0.7, fbm(p * sc * 0.8 + vec2(9.0, 3.0 + t)));
    vec2 uv = p * 0.85 + 0.5 + w * 0.12 * run;
    vec3 c = imgLod(uv, 0.5 + 3.2 * pool * run);
    float h = fbm(p * sc * 1.3 + vec2(2.0, 7.0 + t));
    float e = 0.01;
    float hx = fbm((p + vec2(e, 0.0)) * sc * 1.3 + vec2(2.0, 7.0 + t)) - h;
    float hy = fbm((p + vec2(0.0, e)) * sc * 1.3 + vec2(2.0, 7.0 + t)) - h;
    vec3 n = normalize(vec3(-hx / e * 0.35, -hy / e * 0.35, 1.0));
    vec3 L = normalize(vec3(-0.4, 0.5, 0.8));
    float spec = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 40.0) * (0.3 + 0.9 * clamp(audioRolloff, 0.0, 1.0));
    vec3 base = mix(vec3(0.95, 0.94, 0.9), c, 0.92);
    finish((base * (0.9 + 0.2 * h) + spec * 0.6) * 1.05);
}
