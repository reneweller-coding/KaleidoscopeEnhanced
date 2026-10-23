//@doc
 * @brief FILM GRAIN CLUMPS: the grain of film as it really arises: silver crystals that clump together, coarsest in the mid-tones, fine in shadows and highlights.  The photo stands there grainy, drifting slowly, and the grain is itself a slowly wandering
 * pattern of two sizes with clumps; the roughness of the music makes the clumping stronger, the swell the contrast of the grain (the developer pushed).
 *
 * Audio Reactivity (structure, not only light):
 *   audioRoughness -> how strongly the grain clumps
 *   audioSwell     -> the contrast of the grain
 *
 * Knobs: sizeP (the grain size), hueP.
//@params sizeP
//@audio audioSwell audioRoughness
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5 + 0.05 * vec2(sin(0.05 * sceneTime), cos(0.04 * sceneTime));
    vec3 c = imgLod(uv, 0.4);
    float l = luma(c);
    float mid = 4.0 * l * (1.0 - l);
    vec2 fc = gl_FragCoord.xy;
    float s1 = 1.6 + 3.0 * clamp(sizeP, 0.0, 1.0);
    vec2 drift = vec2(0.7, -0.4) * sceneTime;
    float g1 = noise2((fc + drift) / s1);
    float g2 = noise2((fc * 0.7 + drift.yx) / (s1 * 2.6) + 9.0);
    float clump = smoothstep(0.35, 0.75, g2) * (0.4 + 0.8 * clamp(audioRoughness, 0.0, 1.0));
    float g = (g1 - 0.5) * (1.0 + 1.6 * clump) + 0.6 * (g2 - 0.5) * clump;
    float amp = (0.04 + 0.34 * mid) * (0.8 + 0.5 * clamp(audioSwell, 0.0, 1.0));
    vec3 col = c + g * amp * (0.6 + 0.8 * c);
    finish(col * 1.08);
}
