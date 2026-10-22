//@doc
 * @brief TEXTURE FOG LAYERS PARALLAX: banks of fog made from the photo hang in six layers one behind the other and
 * drift past with the music's drive -- the near ones fast, the far ones slow -- each layer glowing with its own band
 * of the spectrum.  A layer is the softened photo cut into a bank by a drifting noise; it moves sideways by the drive
 * over its depth, so the layers slide against each other; the layers are laid from the back to the front, each veiling
 * what is behind it.  The banks are the photo, calmed toward one colour family, the farthest palest.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance      -> the layers drift past, the near ones faster (integrated)
 *   audioSpectrum[32] -> each layer glows with its band of the spectrum
 *   audioSwell        -> the fog's light
 *
 * Knobs: densityP (how thick the banks are), spreadP (how far apart the layers are), hueP.
//@params densityP spreadP
//@audio audioSpectrum[32] audioSwell
//@body
/**  The photo's colour calmed toward the colour family.
 *
 * @param photo  The photo's colour. (in)
 * @param fh     The family's hue. (in)
 *
 * @return
 *   The colour.
 **/
vec3 tone(vec3 photo, float fh)
{
    float l = luma(photo);
    return mix(photo * 1.1, famCol(fh, 0.15 + 0.7 * l) * (0.25 + 1.2 * l), 0.45);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float drive = 0.08 * sceneTime + 0.35 * audioAdvance;
    float dens = 0.45 + 0.4 * clamp(densityP, 0.0, 1.0);
    float spread = 0.6 + 0.6 * clamp(spreadP, 0.0, 1.0);
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    // the light behind the banks: pale near the horizon, deeper above
    vec3 sky = mix(famLight(fh, 0.6, 0.55), famCol(fh, 0.45) * 0.25, smoothstep(-0.1, 0.5, p.y)) * glow;
    vec3 col = sky;
    for (int k = 5; k >= 0; --k) {
        float fk = float(k);
        float z = 1.0 + fk * spread;
        vec2 q = p * z * 0.6 + vec2(drive / z * 3.0 + fk * 1.7, fk * 0.3);
        float bank = fbm(q * 1.2 + vec2(0.0, 0.03 * sceneTime)) * 0.7 + 0.3 * fbm(q * 3.1 - vec2(0.02 * sceneTime, 0.0));
        float top = -0.32 + 0.12 * fk - 0.35 * (bank - 0.5) * (1.4 - 0.6 * dens);  // the bank's crest: the far ones higher
        float edge = 1.0 - smoothstep(top - 0.03, top + 0.03, p.y);
        float band = 0.0;
        for (int b = 0; b < 5; ++b) band += audioSpectrum[min(k * 5 + b, 31)];
        band = clamp(band / 5.0, 0.0, 1.0);
        // the farther, the paler (the air between): near banks dark with the photo, far ones close to the light
        vec3 c = tone(imgLod(vec2(0.5) + q * 0.18, 3.0), fh) * (0.25 + 0.3 * bank);
        c = mix(c, sky * 0.85, fk / 6.5);
        float rim = exp(-pow((p.y - top) / 0.02, 2.0)) * (0.2 + 0.9 * band);   // the light catching the bank's crest
        col = mix(col, c, edge) + famLight(fh, 0.6, 0.7) * rim * glow * (0.6 - 0.07 * fk) * edge;
    }
    finish(col);
}
