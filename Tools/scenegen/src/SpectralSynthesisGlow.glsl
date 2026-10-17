//@doc
 * @brief SPECTRAL SYNTHESIS GLOW: the photo split into its spectrum like light through a prism foil -- the picture is
 * taken apart into eight bands of wavelength, each band displaced a little further than the last, and added back
 * together: every edge spreads into a rainbow, every highlight into a spectral smear, while flat areas stay their
 * own colour.  The displacement turns and breathes.
 *
 * Audio Reactivity (structure, not only light):
 *   audioCentroid   -> how far the bands part (bright music: wider rainbows; smoothed by the swell)
 *   audioPhase      -> the direction of the split turns (integrated)
 *   audioKick       -> the brightest smears flash (light)
 *
 * Knobs: splitP (the base split), glowP (how much the highlights bloom), photoP (how much of the plain photo stays),
 * hueP.
//@params splitP glowP photoP
//@audio audioSwell audioKick audioCentroid
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.7 + 0.5;
    float ang = 0.05 * audioPhase + 0.03 * sceneTime;
    vec2 dir = vec2(cos(ang), sin(ang));
    float split = (0.012 + 0.03 * clamp(splitP, 0.0, 1.0)) * (0.6 + 0.8 * clamp(audioCentroid, 0.0, 1.0) * clamp(audioSwell + 0.3, 0.0, 1.0));
    vec3 col = vec3(0.0), wsum = vec3(0.0);
    for (int i = 0; i < 8; ++i) {
        float t = float(i) / 7.0;
        vec3 spec = clamp(vec3(1.5 - abs(t * 4.0 - 0.6), 1.5 - abs(t * 4.0 - 2.0), 1.5 - abs(t * 4.0 - 3.4)), 0.0, 1.0);
        vec3 c = imgLod(uv + dir * split * (t - 0.5) * 8.0, 0.3 + 1.5 * clamp(glowP, 0.0, 1.0) * t);
        col += c * spec;
        wsum += spec;
    }
    col /= wsum;
    vec3 plain = imgLod(uv, 0.3);
    col = mix(col, plain, 0.2 + 0.5 * clamp(photoP, 0.0, 1.0) * 0.5);
    float hi = smoothstep(0.7, 1.0, luma(col));
    col += col * hi * 0.4 * (0.4 + clamp(audioKick, 0.0, 1.0));
    finish(col);
}
