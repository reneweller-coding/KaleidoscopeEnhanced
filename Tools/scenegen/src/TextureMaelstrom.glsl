//@doc
 * @brief TEXTURE MAELSTROM: looking down into a whirlpool whose walls are the
 * photograph -- the texture is wound into a logarithmic spiral that turns
 * and sinks toward the eye of the vortex, streaks of foam spiral down with
 * it, the walls grow darker and faster with depth, and at the bottom a
 * cold light glows.  An endless polar field like the Tunnel: it continues
 * past the frame edges and mirrors without seams; every photo gives its
 * own maelstrom.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the downward drift of the walls (integrated, jump-free)
 *   audioPhase      -> the turning of the vortex (integrated)
 *   audioSpread     -> how tightly the spiral winds
 *   audioMode       -> the number of spiral arms (fewer in minor, more in major -- blended, never snapping)
 *   audioRoughness  -> the walls churn (ripple along the spiral)
 *   audioHigh       -> the foam's sparkle (light)
 *   audioBass       -> the glow in the eye (light)
 *   audioSwell      -> the foam's density (slow)
 *
 * Knobs: armsP (base arm count), windP (base winding), foamP (foam amount), hueP.
//@params armsP windP foamP
//@audio audioPhase audioSpread audioMode audioRoughness audioHigh audioBass audioSwell
//@expr foamP = clamp(0.3 + 0.5*swell + 0.2*seed2, 0.0, 1.0)
//@body
// Spiral coordinates: t winds around (jumps by 'arms' at the branch cut --
// arms is even, the mirror period of the photo is 2, so the jump is
// invisible), s runs down the log radius (continuous).
vec2 spiralUV(float arms, float wind, float lr, float a)
{
    float t = a / 6.2831853 * arms - lr * wind - 0.02 * sceneTime - 0.15 * audioPhase;
    float s = lr * 0.9 + 0.04 * sceneTime + audioAdvance * 0.5;
    return vec2(t, s);
}

void main()
{
    vec2 p = screenP() * 2.2;
    float swell = clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float bass = clamp(audioBass, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);

    float r = length(p);
    float a = atan(p.y, p.x);
    float lr = log(max(r, 1e-3));
    // Arms: integer counts cross-faded (mode morphs smoothly between them).
    float armsF = 2.0 + 4.0 * clamp(armsP, 0.0, 1.0) + 2.0 * clamp(audioMode, 0.0, 1.0);
    float a0 = 2.0 * floor(armsF * 0.5), af = (armsF - a0) * 0.5;
    float wind = (1.2 + 1.6 * clamp(windP, 0.0, 1.0)) * (0.8 + 0.5 * clamp(audioSpread, 0.0, 1.0));

    vec3 col = vec3(0.0);
    float da = length(fwidth(vec2(cos(a), sin(a))));
    for (int i = 0; i < 2; ++i) {
        float arms = a0 + 2.0 * float(i);
        float w = (i == 0) ? 1.0 - af : af;
        if (w < 0.001) continue;
        vec2 tuv = spiralUV(arms, wind, lr, a);
        tuv.x += 0.04 * rough * sin(tuv.y * 12.0 + sceneTime * 0.5);
        vec2 q = tuv;
        float fp = max(da * arms / 6.2831853 + fwidth(lr) * wind, fwidth(tuv.y)) * 1024.0;
        float lod = clamp(log2(max(fp, 1.0)), 0.0, 9.0);
        vec3 wall = imgScroll(tuv, lod);
        // Relief lit from above (the sky over the whirlpool).
        vec2 g = texGrad(tuv, lod + 1.5) * 0.015;
        float lit = 0.55 + 0.45 * clamp(0.5 - g.x - g.y, 0.0, 1.0);
        // Foam streaks wound along the arms: noise on the unit circle, turned
        // with the spiral, so it has no seam either.
        vec2 dir = vec2(cos(a - lr * wind * 6.2831853 / arms), sin(a - lr * wind * 6.2831853 / arms));
        float foamN = fbm3(dir * 2.5 + vec2(lr * 1.5 - 0.06 * sceneTime, 0.0));
        float foam = smoothstep(0.62 - 0.2 * clamp(foamP, 0.0, 1.0), 0.8, foamN);
        vec3 c = wall * lit * mix(vec3(1.0), glowColour(imgLod(tuv, 6.0), vec2(cos(a), sin(a)) + lr * 0.1, hueP * 0.159) * 1.5, 0.45);
        c = mix(c, vec3(0.9, 0.97, 1.0), foam * 0.55 * (0.7 + 0.5 * swell));
        c += vec3(1.0) * foam * pow(noise2(dir * 30.0 + lr * 8.0), 6.0) * (0.3 + 1.2 * hi);
        col += c * w;
    }
    // Depth: the walls darken toward the eye, a cold glow at the bottom.
    col *= smoothstep(0.02, 0.6, r) * (0.55 + 0.45 * smoothstep(0.0, 1.2, r));
    vec3 eye = mix(vec3(0.5, 0.8, 1.0), imgPalette(0.55 + hueP * 0.159) * 1.3, 0.35);
    col += eye * exp(-r * 6.0) * (0.4 + 1.0 * bass);
    finish(col);
}
