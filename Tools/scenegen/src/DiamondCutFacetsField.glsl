//@doc
 * @brief DIAMOND CUT FACETS FIELD: the photo seen from inside a brilliant cut: the table, star facets, crown and pavilion throw reflections as in a kaleidoscope of total
 * internal reflection: zones of different fold from the middle outward, each facet showing the photo in its own turn and with its own brightness.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the number of facets steps with the key (cross-faded, integrated)
 *   audioPhase      -> the stone turns (integrated)
 *   audioSwell      -> the facets' brilliance
 *
 * Knobs: facetsP (the base facet number), hueP.
//@params facetsP
//@audio audioSwell audioHarmAdvance
//@body
void main()
{
    vec2 p = screenP();
    float t = 0.05 * sceneTime + 0.4 * audioPhase;
    vec2 q = rot2(t) * p;
    float r = length(q);
    float th = atan(q.y, q.x);
    float nf = 6.0 + 2.0 * floor(3.0 * clamp(facetsP, 0.0, 1.0));
    float mix8 = smoothstep(0.55, 1.0, fract(0.15 * audioHarmAdvance));
    float n1 = nf, n2 = nf + 2.0;
    float zone = r < 0.18 ? 0.0 : (r < 0.45 ? 1.0 : (r < 0.8 ? 2.0 : 3.0));
    float zn = zone < 0.5 ? 1.0 : (zone < 1.5 ? 2.0 : (zone < 2.5 ? 1.0 : 2.0));
    vec3 acc = vec3(0.0);
    for (int j = 0; j < 2; ++j) {
        float n = (j == 0 ? n1 : n2) * zn;
        float sec = 6.2831853 / n;
        float a = abs(mod(th, sec) - 0.5 * sec);
        float rr = zone < 0.5 ? 0.18 - r : (zone < 1.5 ? abs(r - 0.3) : (zone < 2.5 ? 0.8 - r : r - 0.8));
        vec2 f = (r + 0.0 * rr) * vec2(cos(a), sin(a));
        vec2 uv = f * 0.9 + 0.5 + 0.12 * (hash22(vec2(zone, 2.0)) - 0.5);
        float fac = floor(th / sec);
        float bright = 0.6 + 0.5 * hash21(vec2(fac + zone * 17.0, 9.0 + float(j)));
        acc += (j == 0 ? 1.0 - mix8 : mix8) * imgLod(uv, 0.5) * bright;
    }
    float edge = smoothstep(0.0, 0.03, abs(fract(r * 3.0 + 0.0) - 0.5) * 0.5);
    finish(acc * (0.8 + 0.5 * clamp(audioSwell, 0.0, 1.0)) * (0.92 + 0.12 * edge));
}
