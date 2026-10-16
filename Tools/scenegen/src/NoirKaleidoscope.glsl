//@doc
 * @brief NOIR KALEIDOSCOPE: the turning kaleidoscope of the photograph, printed
 * as a silver-gelatin image -- deep blacks, cold silver highlights, the
 * photo's texture raised into a relief by a raking light whose direction
 * slowly turns, and a broad beam that sweeps across the field as if a lamp
 * were carried past; outside the beam the pattern sinks into darkness.  The
 * kaleidoscope never stops turning (the trick of the original Kaleidoscope
 * scene), endless and mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the beam travels (integrated, jump-free)
 *   audioPhase      -> the kaleidoscope turns (integrated)
 *   audioSpread     -> the beam widens
 *   audioRoughness  -> the relief deepens (finer texture raised)
 *   audioMode       -> silver cold in minor, warm platinum in major (slow blend)
 *   audioHarmChange -> the raking light swings round (slow envelope)
 *   audioBass       -> the light's strength (light)
 *
 * Knobs: sidesP (mirror wedges, set per activation), reliefP (relief against
 * plain print), beamP (how dark it is outside the beam), zoomP (scale), hueP (tint).
//@params sidesP reliefP beamP zoomP
//@audio audioPhase audioSpread audioRoughness audioMode audioHarmChange audioBass
//@body
void main()
{
    vec2 p = screenP();
    float bass = clamp(audioBass, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    float sides = 2.0 * floor(3.0 + 3.0 * clamp(sidesP, 0.0, 1.0));   // 6..12 wedges, set per activation
    vec2 uv = p * (0.8 + 0.7 * clamp(zoomP, 0.0, 1.0)) + 0.5;
    vec2 k = kaleidoUV(uv, sides);
    // The print: the kaleidoscoped photo in silver tones, blacks crushed, printed to the photo's own exposure: its mean brightness sets the paper grade (a dark photo still prints).
    float l = luma(imgLod(k, 1.2));
    float m = luma(imgLod(vec2(0.5), 9.0));
    float tone = pow(smoothstep(0.35 * m, min(1.9 * m + 0.08, 1.0), l), 1.4);
    // Relief: the photo's texture raised by a raking light that slowly turns.
    float la = 0.7 + 0.017 * sceneTime + 1.2 * clamp(audioHarmChange, 0.0, 1.0) * 0.3;
    vec2 ld = vec2(cos(la), sin(la));
    float lod = mix(3.0, 1.5, rough);
    vec2 e = vec2(exp2(lod) / 1024.0 + 0.001, 0.0);
    vec2 g = vec2(luma(imgLod(kaleidoUV(uv + e.xy, sides), lod)) - luma(imgLod(kaleidoUV(uv - e.xy, sides), lod)),
                  luma(imgLod(kaleidoUV(uv + e.yx, sides), lod)) - luma(imgLod(kaleidoUV(uv - e.yx, sides), lod)));
    float relief = clamp(0.5 + 6.0 * dot(g, ld), 0.0, 1.0);
    float print = mix(tone, tone * (0.35 + 1.3 * relief), clamp(reliefP, 0.0, 1.0));
    // The beam: a broad band of light sweeping across, its direction turning slowly.
    float ba = 0.3 + 0.011 * sceneTime;
    vec2 bn = vec2(cos(ba), sin(ba));
    float off = 0.45 * sin(0.05 * sceneTime + 0.12 * audioAdvance);
    float width = 0.22 + 0.25 * clamp(audioSpread, 0.0, 1.0);
    float beam = exp(-pow((dot(p, bn) - off) / width, 2.0));
    float outside = 0.04 + 0.22 * (1.0 - clamp(beamP, 0.0, 1.0));
    float light = mix(outside, 1.0, beam) * (0.75 + 0.6 * bass);
    vec3 silver = mix(vec3(0.82, 0.88, 1.0), vec3(1.0, 0.92, 0.80), clamp(audioMode, 0.0, 1.0));
    silver = mix(silver, hsv2rgb(vec3(hueP, 0.3, 1.0)), 0.1);
    vec3 col = silver * print * light * 1.6;
    finish(col);
}
