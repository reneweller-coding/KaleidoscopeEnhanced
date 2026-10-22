//@doc
 * @brief TEXTURE HOLOGRAM LAYERS: the photo split into six holographic layers floating one behind the other -- the
 * brightest parts nearest, the darkest farthest -- drawn in glowing scanlines; the view sways round them with the
 * music's phase so the layers slide against each other, and each layer glows with its own band of the spectrum.  A
 * layer is a plane at its depth showing the parts of the photo whose brightness falls in its band; the view's sway
 * shifts the near planes more than the far ones; the scanlines run across each plane, with a slow flicker of
 * interference and a slight split of the colours at the edges.  Shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase        -> the view sways round the layers, which slide against each other (integrated)
 *   audioSpectrum[32] -> each layer glows with its band of the spectrum
 *   audioSwell        -> the layers' glow
 *
 * Knobs: depthP (how far apart the layers are), lineP (the scanlines' spacing), hueP.
//@params depthP lineP
//@audio audioPhase audioSpectrum[32] audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    const float F = 1.1;
    float sway = 0.03 * sceneTime + 0.35 * audioPhase;
    vec2 eye = vec2(0.7 * sin(sway), 0.35 * sin(0.7 * sway + 1.0));
    float gap = 0.25 + 0.25 * clamp(depthP, 0.0, 1.0);
    float lines = 3.0 + 3.0 * clamp(lineP, 0.0, 1.0);                // pixels per scanline
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec3 col = famCol(fh, 0.4) * 0.02;
    for (int k = 5; k >= 0; --k) {
        float fk = float(k);
        float z = 1.4 + fk * gap;
        vec2 w = p / F + eye / z;                                     // the layers line up when the view is centred
        vec2 uv = vec2(0.5) + w * vec2(0.5, 0.9);
        vec3 ph = imgLod(uv, 1.0);
        float l = luma(imgLod(uv, 3.5));                               // the layers cut from the softened photo
        float lo = 1.0 - (fk + 1.0) / 6.0, hi = 1.0 - fk / 6.0;       // the layer's band of brightness
        float inBand = smoothstep(lo - 0.04, lo + 0.02, l) * (1.0 - smoothstep(hi - 0.02, hi + 0.04, l));
        float rim = exp(-pow((l - lo) / 0.015, 2.0)) + exp(-pow((l - hi) / 0.015, 2.0));   // the layer's outline glows
        float band = 0.0;
        for (int b = 0; b < 5; ++b) band += audioSpectrum[min(int(fk) * 5 + b, 31)];
        band = clamp(band / 5.0, 0.0, 1.0);
        float scan = 0.3 + 0.7 * pow(abs(sin(gl_FragCoord.y * 3.14159265 / lines)), 2.0);
        float flicker = 0.9 + 0.1 * sin(0.7 * sceneTime + fk * 1.3 + w.y * 6.0);
        vec3 tint = famLight(fh, 0.2 + 0.12 * fk, 0.35);
        float ca = luma(imgLod(uv + vec2(0.004, 0.0), 1.0)) - luma(ph);   // the colour split at the edges
        vec3 c = tint * (0.5 + 0.8 * luma(ph)) + vec3(ca, 0.0, -ca) * 0.6;
        col += c * (0.3 * inBand + 0.9 * rim) * scan * flicker * (0.35 + 0.9 * band) * glow * (0.55 + 0.1 * (5.0 - fk));
    }
    finish(famExpose(max(col, vec3(0.0)), 1.98, 1.00, 0.00, fh));
}
