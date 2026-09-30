//@doc
 * @brief TEXTURE CLOUD INTERIOR: flying through the inside of towering
 * clouds -- soft white and grey masses loom up out of the haze and slide
 * past, the sun behind them turning their edges into silver and gold
 * linings, shafts of light breaking through the gaps, darker cores glowing
 * warm where the light scatters deep inside.  The clouds are built from
 * the photograph: its bright regions become the dense cloud, so every
 * photo gives its own cloudscape; its colours tint the light.  The flight
 * never ends; no horizon, the view is into the clouds.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the flight speed (integrated, jump-free)
 *   audioSpread     -> how deep the view reaches into the haze
 *   audioRoughness  -> the cloud edges fray into wisps
 *   audioMode       -> the sun warms from silver toward gold in major (slow blend)
 *   audioBass       -> the light breaking through the gaps (light)
 *   audioSwell      -> the density of the clouds (slow)
 *
 * Knobs: densityP (cloud cover), sunP (sun strength), tintP (photo tint), hueP.
//@params densityP sunP tintP
//@audio audioSpread audioRoughness audioMode audioBass audioSwell
//@expr densityP = clamp(0.4 + 0.35*swell + 0.2*seed2, 0.0, 1.0)
//@body
void main()
{
    vec2 p = screenP();
    float bass = clamp(audioBass, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    float z0 = 0.12 * sceneTime + 1.0 * audioAdvance;
    float spacing = 0.22 + 0.12 * clamp(audioSpread, 0.0, 1.0);
    vec2 sunDir = normalize(vec2(0.5, 0.7));
    vec3 sunC = mix(vec3(0.95, 0.97, 1.05), vec3(1.15, 0.9, 0.6), clamp(audioMode, 0.0, 1.0));

    // The haze beyond: bright toward the sun.
    // Deep blue sky between the clouds, brighter toward the sun.
    vec3 col = mix(vec3(0.12, 0.28, 0.6), vec3(0.45, 0.62, 0.9), 0.5 + 0.5 * dot(normalize(p + 1e-4), sunDir) * smoothstep(0.0, 0.8, length(p)));
    float dens0 = 0.15 + 0.4 * clamp(densityP, 0.0, 1.0);

    const int N = 9;
    float base = floor(z0 / spacing), fr = fract(z0 / spacing);
    for (int i = N - 1; i >= 0; --i) {
        float li = base + float(i);
        float z = (float(i) + 1.0 - fr) * spacing;
        float persp = 1.0 / z;
        vec2 q = p * persp * 0.28 + hash22(vec2(li, 7.0)) * 9.0;
        // Cloud density: the photo's bright regions (soft mip), shaped by noise.
        float ph = luma(imgLod(q * 0.6, 6.0));
        float avg = luma(imgLod(q * 0.6, 9.0));
        float n = fbm(q * 1.3 + li * 0.7);
        n += 0.12 * rough * (noise2(q * 9.0 + li) - 0.5);
        // Billows: a cloud mass (broad noise) with cauliflower tops (finer).
        float mass = noise2(q * 0.55 + li * 1.3);
        float d = mass * 0.9 + (n - 0.5) * 0.35 + (ph - avg) * 0.35;
        float c = smoothstep(0.62 - dens0 * 0.25, 0.68 - dens0 * 0.25, d);
        // Lighting: sample the density toward the sun; less density there = lit edge.
        vec2 qs = q + sunDir * 0.15;
        float dl = noise2(qs * 0.55 + li * 1.3) * 0.9 + (fbm(qs * 1.3 + li * 0.7) - 0.5) * 0.35 + (luma(imgLod(qs * 0.6, 6.0)) - avg) * 0.35;
        float lit = clamp(0.35 + (d - dl) * 5.0, 0.0, 1.0);
        float depthIn = smoothstep(0.62, 0.95, d);                      // deep inside the cloud: darker
        vec3 tint = mix(vec3(1.0), glowColour(imgLod(q * 0.6, 7.0), q * 0.2, hueP * 0.159), 0.35 * clamp(tintP, 0.0, 1.0));
        vec3 shade = mix(vec3(0.42, 0.46, 0.55), vec3(0.75, 0.6, 0.55), 0.3) * tint;
        vec3 cc = mix(shade, sunC * 1.25, lit) * (1.0 - 0.35 * depthIn * (1.0 - lit));
        // Silver lining: the thin edge facing the sun glows brightly.
        float edge = (1.0 - smoothstep(0.62, 0.7, d - (0.0))) * c * lit;
        cc += sunC * edge * (0.8 + 0.6 * clamp(sunP, 0.0, 1.0)) * (0.8 + 0.5 * bass);
        // Aerial perspective: far layers melt into the haze.
        float fade = smoothstep(float(N) * spacing, float(N) * spacing * 0.5, z) * smoothstep(0.03, 0.25, z);
        cc = mix(col, cc, 0.35 + 0.65 * smoothstep(float(N) * spacing, 0.3, z));
        col = mix(col, cc, c * fade);
    }
    // Shafts of light through the gaps, radiating from the sun direction.
    vec2 sp2 = sunDir * 0.9;
    vec2 v = p - sp2;
    float ang = atan(v.y, v.x);
    float rays = pow(0.5 + 0.5 * noise2(vec2(ang * 9.0, z0 * 0.3)), 3.0) * exp(-length(v) * 0.9);
    col += sunC * rays * (0.15 + 0.35 * clamp(sunP, 0.0, 1.0)) * (0.6 + 0.8 * bass);
    finish(col);
}
