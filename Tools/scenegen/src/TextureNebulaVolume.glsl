//@doc
 * @brief TEXTURE NEBULA VOLUME: flying through a nebula made of the
 * photograph -- the texture is stacked in many translucent layers that
 * drift toward the camera and past it, each one a veil of glowing gas in
 * the photo's colours with dark dust lanes where the photo is dark,
 * lit from within by hidden stars that shine through as soft bright cores,
 * with sharp stars far behind.  Layers fade in from the depth and fade out
 * as they pass the camera, so the flight never ends; the field is endless
 * sideways and mirrors without seams.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the flight through the layers (integrated, jump-free)
 *   audioSpread     -> how deep the volume reaches (layer spacing)
 *   audioRoughness  -> turbulence twisting the gas
 *   audioMode       -> the emission colour leans warm (H-alpha) in major, cool (OIII) in minor
 *   audioBass       -> the embedded stars glow (light)
 *   audioSwell      -> gas density (slow)
 *
 * Knobs: densityP (gas), colourP (photo colour vs. emission colours),
 * turbP (turbulence), hueP.
//@params densityP colourP turbP
//@audio audioSpread audioRoughness audioMode audioBass audioSwell
//@expr densityP = clamp(0.4 + 0.4*swell + 0.2*seed2, 0.0, 1.0)
//@body
void main()
{
    vec2 p = screenP();
    float swell = clamp(audioSwell, 0.0, 1.0);
    float bass = clamp(audioBass, 0.0, 1.0);
    float turb = 0.2 + 0.5 * clamp(turbP, 0.0, 1.0) + 0.3 * clamp(audioRoughness, 0.0, 1.0);
    float z0 = 0.18 * sceneTime + 1.5 * audioAdvance;
    float spacing = 0.28 + 0.2 * (1.0 - clamp(audioSpread, 0.0, 1.0));

    // Deep background: sharp stars.
    vec3 col = vec3(0.004, 0.004, 0.012);
    {
        vec2 g = p * 110.0, gi = floor(g), gf = fract(g);
        vec2 gc = 0.25 + 0.5 * hash22(gi);
        col += vec3(0.85, 0.9, 1.0) * smoothstep(0.1, 0.0, length(gf - gc)) * step(0.992, hash21(gi + 5.0));
    }
    float mode = clamp(audioMode, 0.0, 1.0);
    vec3 emit = mix(vec3(0.2, 0.75, 0.85), vec3(1.0, 0.3, 0.45), mode);

    // Layers from far to near (painter's order), each at depth z in (0, N].
    const int N = 10;
    float base = floor(z0 / spacing);
    float fr = fract(z0 / spacing);
    for (int i = N - 1; i >= 0; --i) {
        float li = base + float(i);                        // layer id (stable while it travels)
        float z = (float(i) + 1.0 - fr) * spacing;          // distance to the camera
        float persp = 1.0 / z;
        vec2 q = p * persp * 0.35 + hash22(vec2(li, 3.0)) * 7.0;
        // Turbulence: twist the layer by a curl-ish offset.
        q += turb * 0.15 * vec2(fbm3(q * 1.3 + li), fbm3(q * 1.3 + li + 9.0));
        vec3 ph = imgLod(q, 4.5);
        float lum = luma(ph);
        // Gas from the photo's local structure (not its absolute brightness,
        // so bright and dark photos give the same density), shaped by noise.
        float avg = luma(imgLod(q, 7.0));
        float g0 = fbm3(q * 1.5 + li) * 0.7 + (lum - avg) * 1.8 + 0.15;
        // Only islands of gas per layer, so dark space shows between the veils.
        float island = smoothstep(0.3, 0.62, noise2(q * 0.35 + li * 1.7));
        float gas = smoothstep(0.45, 0.9, g0) * island * (0.35 + 0.65 * clamp(densityP, 0.0, 1.0));
        lum = clamp(0.5 + (lum - avg) * 1.5, 0.0, 1.0);
        // Fade in from the depth, out as it passes the camera.
        float fade = smoothstep(float(N) * spacing, float(N) * spacing * 0.6, z) * smoothstep(0.05, 0.4, z);
        vec3 c = mix(emit * (0.4 + 1.2 * lum), glowColour(ph, q * 0.5, hueP * 0.159) * (0.3 + 1.2 * lum), clamp(colourP, 0.0, 1.0) * 0.7 + 0.2);
        c = mix(vec3(luma(c)), c, 1.8);
        // Dust: the dark parts of the photo absorb what lies behind.
        float dust = smoothstep(0.3, 0.05, g0) * 0.35 * fade;
        col *= 1.0 - dust;
        // Glowing gas: emits and partly hides what lies behind it.
        col = col * (1.0 - 0.3 * gas * fade) + c * gas * fade * 1.1;
        // Embedded stars: soft bright cores in the gas, one per layer cell.
        vec2 sq = q * 1.3, si = floor(sq);
        vec2 sc = si + hash22(si + li);
        sc = si + 0.3 + 0.4 * hash22(si + li);                  // keep the star inside its cell
        float sd = length(sq - sc);
        float has = step(0.75, hash21(si + li * 3.0)) * smoothstep(0.3, 0.0, sd - 0.2);
        col += vec3(1.0, 0.95, 0.9) * exp(-sd * sd / (0.0004 * min(persp * persp, 3.0))) * has * fade * (0.4 + 0.9 * bass);
        col += emit * exp(-sd * 9.0) * has * fade * 0.12 * (0.6 + 0.8 * bass);
    }
    finish(col * (0.8 + 0.4 * swell));
}
