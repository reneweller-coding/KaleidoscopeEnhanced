//@doc
 * @brief TEXTURE HOLO FOIL: the photograph printed on crumpled holographic
 * foil -- every facet of the crinkled foil throws back a different slice
 * of the rainbow as the light moves, colours racing across the folds in
 * sheets, while the photo shows through the foil's diffraction as its
 * pattern.  The foil itself breathes slowly (the creases shift), the light
 * wanders, so the whole frame shimmers.  An endless field, mirrorable.
 *
 * Diffraction: the colour of a facet is the grating equation's
 * wavelength for its tilt against the light, so neighbouring facets show
 * neighbouring hues, as real holographic foil does.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the light's path (integrated, jump-free)
 *   audioAdvance    -> the creases shift (integrated)
 *   audioSpread     -> crease size (wide spectrum = finer crinkle)
 *   audioRoughness  -> extra fine creases
 *   audioHigh       -> sparkle on the sharpest creases (light)
 *   audioSwell      -> the rainbow's strength (slow)
 *
 * Knobs: crinkleP (crease depth), photoP (how much the photo shows),
 * gratingP (rainbow spacing), hueP.
//@params crinkleP photoP gratingP
//@audio audioPhase audioSpread audioRoughness audioHigh audioSwell
//@body
float gT, gSc, gRough;

// Crumpled foil height: ridged noise (sharp creases, smooth slopes between).
float crumple(vec2 q)
{
    float h = 0.0, a = 0.5;
    for (int k = 0; k < 3; ++k) {
        h += a * (1.0 - abs(noise2(q + vec2(gT * 0.05 * float(k + 1), 0.0)) * 2.0 - 1.0));
        q = mat2(1.6, 1.2, -1.2, 1.6) * q + 3.1; a *= 0.5;
    }
    return h;
}

void main()
{
    vec2 p = screenP();
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    gT = sceneTime + 5.0 * audioAdvance;
    gRough = clamp(audioRoughness, 0.0, 1.0);
    gSc = 1.5 + 2.0 * clamp(audioSpread, 0.0, 1.0);
    vec2 q = p * gSc;
    float e = 0.02;
    float h0 = crumple(q);
    vec2 grad = vec2(crumple(q + vec2(e, 0.0)) - h0, crumple(q + vec2(0.0, e)) - h0) / e;
    grad += (0.1 + 0.3 * gRough) * vec2(noise2(q * 5.0) - 0.5, noise2(q * 5.0 + 9.0) - 0.5);
    vec2 tilt = grad * (0.15 + 0.35 * clamp(crinkleP, 0.0, 1.0));
    vec3 n = normalize(vec3(tilt, 1.0));
    // The light wanders on a slow path.
    float lp = 0.07 * sceneTime + 0.3 * audioPhase;
    vec3 L = normalize(vec3(0.8 * sin(lp), 0.6 * cos(lp * 0.77), 1.0));
    vec3 V = vec3(0.0, 0.0, 1.0);
    // Grating: the diffracted wavelength depends on the in-plane component of
    // (L + V) along the grating direction, relative to the facet.
    vec3 hv = L + V;
    float s = dot(hv - n * dot(hv, n), normalize(vec3(1.0, 0.3, 0.0)));
    float spacing = 0.35 + 0.5 * clamp(gratingP, 0.0, 1.0);
    float lambda = fract(s * spacing + hueP * 0.159 + 0.5);
    vec3 rainbow = hsv2rgb(vec3(lambda, 0.9, 1.0));
    float spec = pow(max(dot(reflect(-L, n), V), 0.0), 6.0);
    // The photo under the foil (seen through the diffraction as its pattern).
    vec2 uv = p * 0.8 + 0.5 + vec2(0.006, 0.004) * sceneTime;
    vec3 ph = imgLod(uv + tilt * 0.01, 1.0);
    float phw = clamp(photoP, 0.0, 1.0);
    vec3 base = mix(vec3(0.55), ph, 0.3 + 0.6 * phw) * 0.5;
    vec3 col = base * (0.6 + 0.6 * luma(ph)) + rainbow * (0.35 + 0.8 * spec) * (0.6 + 0.6 * swell) * mix(1.0, 0.5 + luma(ph), phw * 0.6);
    // Sparkle on the sharpest ridges.
    float ridge = smoothstep(0.85, 1.0, h0 / 0.94);
    col += vec3(1.0) * ridge * spec * (0.3 + 1.2 * hi);
    col *= 1.0 - 0.25 * ridge;
    finish(col);
}
