//@doc
 * @brief LUMINOUS FOG STRATA: strata of luminous fog at many depths, each in a closely related tone of the photo, drift
 * past one another at their own speeds and tear open into holes and channels with the sections; each layer glows with
 * its own band of the music.  A layer is a sheet of drifting noise seen at its depth (the drift divided by the depth,
 * so far layers move slowly); a threshold carves its holes, and a new section moves the threshold; the layers lie over
 * one another far to near.  The bands are smoothed over a second or so in a small field of the scene's own.  The tones
 * are neighbours in one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance       -> the layers drift (integrated)
 *   audioSpectrum[32]  -> each layer glows with its own band (smoothed)
 *   audioSectionId/Age -> every new section tears the layers open further or closes them (cross-faded)
 *
 * Knobs: layerP (how many layers), scaleP (the fog's scale), hueP.
//@params layerP scaleP
//@audio audioSpectrum[32] audioSectionId audioSectionPrev audioSectionAge
//@state 8 1 60
//@body
/**  The state pass: six bands of the spectrum, each smoothed over a second or so.
 *
 * @return
 *   This cell's smoothed band, 0, 0, 1.
 **/
vec4 stateStep()
{
    int k = stCell().x;
    float b = 0.0;
    for (int i = 0; i < 4; ++i) b += audioSpectrum[min(2 + 5 * k + i, 31)];
    b = clamp(b * 0.25, 0.0, 1.0);
    float old = stateFrame < 0.5 ? b : texelFetch(texState, ivec2(k, 0), 0).r;
    return vec4(mix(old, b, 0.04), 0.0, 0.0, 1.0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float fh = famHue();
    float N = floor(4.0 + 2.0 * clamp(layerP, 0.0, 1.0));
    float sc = 1.2 + 1.0 * clamp(scaleP, 0.0, 1.0);
    float run = 0.03 * sceneTime + 0.12 * audioAdvance;
    float m = smoothstep(0.0, 6.0, audioSectionAge);
    float thr = mix(0.35 + 0.15 * mod(max(audioSectionPrev, 0.0), 2.0), 0.35 + 0.15 * mod(max(audioSectionId, 0.0), 2.0), m);
    vec3 col = famCol(fh, 0.45) * 0.02;
    for (int k = 0; k < 6; ++k) {                                    // far to near
        float fk = float(k);
        if (fk >= N) break;
        float z = 3.0 - 0.45 * fk;
        float band = texelFetch(texState, ivec2(k, 0), 0).r;
        vec2 q = p * sc * z * 0.5 + vec2(run, 0.3 * run) / z * 3.0 + 7.3 * fk;
        float f = fbm(q);
        float a = smoothstep(thr, thr + 0.3, f);
        vec3 fc = famLight(fh, 0.2 + 0.6 * fk / max(N - 1.0, 1.0), 0.2) * (0.25 + 1.1 * band) * (0.6 + 0.6 * f);
        col = mix(col, fc, a * 0.75);
    }
    finish(col);
}
