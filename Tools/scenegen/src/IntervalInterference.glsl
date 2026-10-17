//@doc
 * @brief INTERVAL INTERFERENCE: two wave fields in the ratio of the interval being played -- the two strongest pitch
 * classes give an interval, its just ratio (3:2 for a fifth, 5:4 for a third, 16:15 for a semitone) sets the second
 * field's wavelength against the first.  Consonant ratios lock the two into a calm, repeating moire; dissonant ones
 * beat, their interference sliding in slow swells.  The photo is refracted through the combined waves; when the
 * interval changes, the ratio glides to the new one.
 *
 * Audio Reactivity (structure, not only light):
 *   audioChroma     -> the interval (the two strongest pitch classes, smoothed on the state pass; the ratio glides)
 *   audioPhase      -> the waves run (integrated)
 *   audioKick       -> the crests flash (light)
 *
 * Knobs: waveP (the wavelength), refractP (how strongly the photo is refracted), photoP (photo share), hueP.
//@params waveP refractP photoP
//@audio audioChroma[12] audioKick
//@state 13 1 60
//@body
/**  The just ratio of an interval.
 *
 * @param i  The interval in semitones (0..11). (in)
 *
 * @return
 *   The ratio.
 **/
float justRatio(int i)
{
    if (i == 0) return 1.0; if (i == 1) return 16.0 / 15.0; if (i == 2) return 9.0 / 8.0; if (i == 3) return 6.0 / 5.0;
    if (i == 4) return 5.0 / 4.0; if (i == 5) return 4.0 / 3.0; if (i == 6) return 45.0 / 32.0; if (i == 7) return 3.0 / 2.0;
    if (i == 8) return 8.0 / 5.0; if (i == 9) return 5.0 / 3.0; if (i == 10) return 9.0 / 5.0; return 15.0 / 8.0;
}

/**  The state pass: texels 0..11 smooth the chroma; texel 12 glides toward the just ratio of the two strongest.
 *
 * @return
 *   The smoothed chroma (r) or the ratio (r).
 **/
vec4 stateStep()
{
    int i = int(gl_FragCoord.x);
    vec4 c = texelFetch(texState, ivec2(i, 0), 0);
    if (i < 12) {
        float v = clamp(audioChroma[i], 0.0, 1.0);
        return vec4(stateFrame < 0.5 ? v : mix(c.r, v, 0.03), 0.0, 0.0, 1.0);
    }
    float b1 = -1.0, b2 = -1.0;
    int i1 = 0, i2 = 7;
    for (int k = 0; k < 12; ++k) {
        float v = texelFetch(texState, ivec2(k, 0), 0).r;
        if (v > b1) { b2 = b1; i2 = i1; b1 = v; i1 = k; } else if (v > b2) { b2 = v; i2 = k; }
    }
    float target = justRatio((i2 - i1 + 12) % 12);
    if (stateFrame < 0.5) return vec4(target, 0.0, 0.0, 1.0);
    return vec4(mix(c.r, target, 0.03), 0.0, 0.0, 1.0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float ratio = texelFetch(texState, ivec2(12, 0), 0).r;
    float k = 40.0 + 50.0 * clamp(waveP, 0.0, 1.0);
    float t = 0.15 * audioPhase + 0.6 * sceneTime;
    vec2 s1 = vec2(-0.45 + 0.1 * sin(0.05 * sceneTime), 0.08 * cos(0.04 * sceneTime));
    vec2 s2 = vec2(0.45 + 0.1 * cos(0.045 * sceneTime), -0.08 * sin(0.035 * sceneTime));
    float d1 = length(p - s1), d2 = length(p - s2);
    float w1 = sin(k * d1 - t), w2 = sin(k * ratio * d2 - t * ratio);
    float A = 0.5 * (w1 + w2);
    vec2 g = 0.5 * (k * cos(k * d1 - t) * (p - s1) / max(d1, 1e-3) + k * ratio * cos(k * ratio * d2 - t * ratio) * (p - s2) / max(d2, 1e-3));
    float refr = (0.0006 + 0.0012 * clamp(refractP, 0.0, 1.0));
    vec2 uv = p * 0.55 + 0.5 + g * refr;
    vec3 photo = imgLod(uv, 0.3);
    vec3 tone = imgPalette(0.3 + 0.2 * A + 0.03 * audioPhase);
    vec3 col = mix(photo * tone * 1.6, photo, 0.55 + 0.4 * clamp(photoP, 0.0, 1.0)) * (0.8 + 0.3 * A);
    col += mix(tone, vec3(1.0), 0.5) * smoothstep(0.75, 1.0, A) * 0.25 * (0.4 + clamp(audioKick, 0.0, 1.0));
    finish(col);
}
