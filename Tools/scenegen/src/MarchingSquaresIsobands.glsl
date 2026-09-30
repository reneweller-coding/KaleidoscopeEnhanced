//@doc
 * @brief MARCHING SQUARES ISOBANDS: the photograph as a stepped relief map of
 * flat coloured bands, as a plotter would draw it -- its brightness sliced
 * into contour bands, each band a flat layer of colour stacked like cut
 * paper, with a small drop shadow at each step so the layers read as
 * terraces; the levels creep slowly so the terraces grow and shrink.
 * Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the levels creep (integrated, jump-free)
 *   audioSpread     -> the number of bands
 *   audioKick       -> the band edges catch light (light)
 *   audioMode       -> palette: cool (blue-teal) in minor, warm (sand-red) in major
 *   audioSwell      -> the shadow depth (slow)
 *   audioRoughness  -> the band edges get more detailed
 *
 * Knobs: smoothP (relief smoothness), paletteP (palette spread), shadowP (layer shadows), hueP.
//@params smoothP paletteP shadowP
//@audio audioSpread audioKick audioMode audioSwell audioRoughness
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    vec2 uv = p * 0.5 + 0.5 + vec2(0.002, 0.001) * sceneTime;
    float lod = 4.5 - 1.5 * rough + 1.5 * clamp(smoothP, 0.0, 1.0);
    float T = 0.03 * sceneTime + 0.2 * audioAdvance;
    float nB = 6.0 + 10.0 * clamp(audioSpread, 0.0, 1.0);
    // Four offset taps smooth the coarse mip (no bilinear crosses in the isolines).
    float e = exp2(lod) / 1024.0 * 0.5;
    float h = 0.25 * (luma(imgLod(uv + vec2(e, e), lod)) + luma(imgLod(uv + vec2(-e, e), lod)) + luma(imgLod(uv + vec2(e, -e), lod)) + luma(imgLod(uv - vec2(e, e), lod)));
    h += 0.05 * fbm3(p * 2.0);
    float x = h * nB + T;
    float band = floor(x);
    float fb = fract(x);
    // Palette per band.
    float t = fract(band * (0.07 + 0.08 * clamp(paletteP, 0.0, 1.0)) + hueP * 0.159);
    vec3 cool = 0.5 + 0.5 * cos(6.2831853 * (t * 0.8 + vec3(0.55, 0.6, 0.7)));
    vec3 warm = 0.5 + 0.5 * cos(6.2831853 * (t * 0.8 + vec3(0.0, 0.1, 0.25)));
    vec3 col = mix(cool, warm, mode) * (0.55 + 0.45 * fract(band * 0.37 + 0.2));
    // Drop shadow just above each step and light on each layer's upper edge,
    // measured in band units (fwidth of a coarse mip is blocky, so not used
    // for the shading, only for the anti-aliasing of the edge line).
    float sh = exp(-fb * (10.0 - 5.0 * swell)) * (0.3 + 0.5 * clamp(shadowP, 0.0, 1.0));
    col *= 1.0 - sh;
    float px = clamp(fwidth(x), 0.002, 0.2);
    float edge = exp(-(1.0 - fb) / (px * 1.5));
    col += vec3(1.0) * edge * (0.08 + 0.4 * kick);
    // Paper grain per layer.
    col *= 0.96 + 0.04 * noise2(p * 300.0 + band);
    finish(col);
}
