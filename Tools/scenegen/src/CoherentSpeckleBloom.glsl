//@doc
 * @brief COHERENT SPECKLE BLOOM: laser speckle -- coherent light scattered by a rough surface interferes into a
 * granular field of bright and dark specks; as the light grows more ordered, the specks gather into blooms: rings
 * and petals of interference from a few strong directions.  The field breathes between random grain and ordered
 * rosettes; the specks carry the photo's colours.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the coherence: loud passages order the speckle into blooms
 *   audioPhase      -> the scatterers drift: the speckle boils (integrated)
 *   audioKick       -> the brightest specks flash (light)
 *
 * Knobs: grainP (speckle size), petalsP (petals in a bloom), photoP (photo share), hueP.
//@params grainP petalsP photoP
//@audio audioSwell audioKick
//@body
void main()
{
    vec2 p = screenP();
    float k = 60.0 + 80.0 * (1.0 - clamp(grainP, 0.0, 1.0));
    float t = 0.05 * audioPhase + 0.08 * sceneTime;
    // random scattering: many waves, random directions and phases, drifting slowly
    vec2 ran = vec2(0.0);
    for (int i = 0; i < 20; ++i) {
        float fi = float(i);
        float a = 6.2831853 * hash11(fi * 1.7 + 0.3) + 0.2 * sin(t * (0.5 + hash11(fi)) + fi);
        float ph = k * dot(p, vec2(cos(a), sin(a))) + 6.2831853 * hash11(fi * 4.1) + t * (1.0 + hash11(fi * 2.3));
        ran += vec2(cos(ph), sin(ph));
    }
    // ordered light: a few strong directions, evenly spread, forming rosettes
    float np = 3.0 + floor(5.0 * clamp(petalsP, 0.0, 1.0));
    vec2 ord = vec2(0.0);
    for (int i = 0; i < 8; ++i) {
        if (float(i) >= np) break;
        float a = 3.14159265 * float(i) / np + 0.02 * sceneTime;
        float ph = k * 0.6 * dot(p, vec2(cos(a), sin(a)));
        ord += vec2(cos(ph), sin(ph)) * 2.0;
    }
    float coh = smoothstep(0.1, 0.9, clamp(audioSwell, 0.0, 1.0));
    vec2 f = mix(ran / 4.5, ord / np * 2.0, coh);
    float I = dot(f, f);
    float lit = 1.0 - exp(-I * 0.6);
    vec2 uv = p * 0.7 + 0.5;
    vec3 photo = imgLod(uv, 0.8);
    vec3 tone = imgPalette(atan(f.y, f.x) / 6.2831853 + 0.03 * audioPhase);
    vec3 col = photo * 0.08 + mix(tone * 1.3, photo * 1.6, 0.35 + 0.5 * clamp(photoP, 0.0, 1.0)) * lit;
    col += mix(tone, vec3(1.0), 0.6) * smoothstep(0.85, 1.0, lit) * 0.3 * (0.4 + clamp(audioKick, 0.0, 1.0));
    finish(col);
}
