//@doc
 * @brief PHOTO FOURIER PHASE SWAP: the famous swap of amplitude and phase -- two pictures cut from the photo, each taken
 * apart band by band into local amplitude and local phase (the monogenic signal: the band and its Riesz transform),
 * and put together with the strength of the one and the phase of the other.  The phase carries the forms: as the
 * blend moves over, the first picture's colours and contrasts take on the second picture's shapes, and back.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos  -> the blend goes over and back once a phrase (continuous)
 *   audioAdvance    -> both pictures drift (integrated)
 *
 * Knobs: bandsP (how many bands are swapped), cutP (where the second picture is cut), photoP (how much of the first
 * picture's colour stays), hueP.
//@params bandsP cutP photoP
//@audio audioPhrasePos
//@body
/**  One band of the photo's luma at a point: the level over the next broader one.
 *
 * @param uv  The point. (in)
 * @param k   The level. (in)
 *
 * @return
 *   The band's value.
 **/
float bandAt(vec2 uv, float k) { return luma(imgLod(uv, k)) - luma(imgLod(uv, k + 1.0)); }

/**  The monogenic signal of one band: the band, its Riesz pair (approximated by the band's slope at its own scale),
 * as amplitude and phase.
 *
 * @param uv  The point. (in)
 * @param k   The level. (in)
 *
 * @return
 *   The amplitude (x) and the phase (y).
 **/
vec2 monogenic(vec2 uv, float k)
{
    float e = exp2(k) / 1024.0;
    float b = bandAt(uv, k);
    vec2 rz = vec2(bandAt(uv + vec2(e, 0.0), k) - bandAt(uv - vec2(e, 0.0), k),
                   bandAt(uv + vec2(0.0, e), k) - bandAt(uv - vec2(0.0, e), k)) * 0.5 * 1.5707963;
    float rl = length(rz);
    return vec2(sqrt(b * b + rl * rl), atan(rl, b));
}

void main()
{
    vec2 p = screenP();
    float prog = audioPhrasePos > 0.001 ? audioPhrasePos : fract(sceneTime / 16.0);
    float m = 0.5 - 0.5 * cos(6.2831853 * prog);               // over and back once a phrase
    vec2 drift = 0.05 * vec2(sin(0.019 * sceneTime + 0.01 * audioAdvance), cos(0.016 * sceneTime));
    vec2 uvA = 0.5 + p * 0.5 + drift;
    float cut = clamp(cutP, 0.0, 1.0);
    vec2 uvB = 0.5 + rot2(2.2 + 1.5 * cut) * (p * 0.55 - drift) + vec2(0.31, -0.27) + 0.2 * cut;
    int nb = int(3.0 + 2.99 * clamp(bandsP, 0.0, 1.0));
    float lum = luma(imgLod(uvA, 6.5)) * (1.0 - m) + luma(imgLod(uvB, 6.5)) * m;
    for (int k = 0; k < 6; ++k) {
        float fk = float(k) + 0.5;
        float a = bandAt(uvA, fk);
        if (k < nb) {
            vec2 mA = monogenic(uvA, fk), mB = monogenic(uvB, fk);
            float swapped = mA.x * cos(mB.y);                   // the first's strength with the second's phase
            a = mix(a, swapped, m);
        }
        lum += a;
    }
    vec3 cA = imgLod(uvA, 3.0), cB = imgLod(uvB, 3.0);
    vec3 chroma = mix(cA, mix(cA, cB, m), 0.6 - 0.5 * clamp(photoP, 0.0, 1.0));
    vec3 col = chroma * (max(lum, 0.0) / max(luma(chroma), 0.03));
    finish(col);
}
