//@doc
 * @brief OIL PROJECTOR (rebuilt 30.09.2026): a Mathmos oil-wheel light show,
 * built from what makes the real one mesmerising -- two immiscible dyed
 * oils and clear water sealed between glass, so the picture is made of
 * SHARP rounded interfaces, never of smeared colour: blobs of deep magenta
 * and yellow oil float in the bright water, where they overlap the dyes
 * multiply to red and green, every interface is a dark refraction line
 * with a bright focused rim and a rainbow fringe from the lens, and small
 * air bubbles drift through with dark rings.  The wheel turns slowly, the
 * oils creep and merge under the lamp's heat.  Two or three projectors
 * overlap, their soft light circles blending into one endless wall of
 * light.  The dyes are taken from the photo where it has colour.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the heat that makes the oils creep (integrated, jump-free)
 *   audioPhase      -> the wheel's turning (integrated)
 *   audioSpread     -> viscosity: a wide spectrum makes the blobs smaller and busier
 *   audioMode       -> the dye pair shifts warmer in major (slow blend)
 *   audioRoughness  -> the interfaces tremble
 *   audioBass       -> the lamps' brightness (light)
 *   audioSwell      -> the size of the oil blobs (slow)
 *
 * Knobs: projP (how many projectors), focusP (sharp or dreamy focus),
 * bubbleP (amount of air bubbles), scaleP (magnification), hueP.
//@params projP focusP bubbleP scaleP
//@audio audioPhase audioSpread audioMode audioRoughness audioBass audioSwell audioHigh
//@expr focusP = clamp(0.55 + 0.25*seed2, 0.0, 1.0)
//@body
float gHeat, gVisc, gBlob, gRough, gSharp;

// One oil phase: a warped, smooth field thresholded into round blobs.
// Returns the signed distance-ish value (0 at the interface, > 0 inside).
float oilField(vec2 q, float seed)
{
    vec2 w = q + 0.55 * vec2(fbm3(q * 0.6 + seed + gHeat * 0.35), fbm3(q * 0.6 + seed + 5.2 - gHeat * 0.3));
    w += 0.03 * gRough * vec2(sin(q.y * 17.0 + sceneTime * 0.7), cos(q.x * 17.0 - sceneTime * 0.6));
    // Few octaves: surface tension keeps the interfaces round, never ragged.
    float f = 0.7 * noise2(w * gVisc + seed * 3.1 + vec2(gHeat * 0.12, -gHeat * 0.09)) + 0.3 * noise2(w * gVisc * 2.1 + seed);
    return (f - (0.57 - 0.08 * gBlob)) * 5.0;
}

// Light transmitted through the wheel at q for one colour channel's offset.
vec3 wheel(vec2 q, vec3 dyeA, vec3 dyeB, out float edgeA, out float edgeB)
{
    float a = oilField(q, 1.7);
    float b = oilField(q * 1.13 + 3.0, 9.4);
    float s = gSharp;
    float inA = smoothstep(-s, s, a);
    float inB = smoothstep(-s, s, b);
    // Subtractive dyes: each oil absorbs, overlaps multiply.
    vec3 T = vec3(1.0);
    T *= mix(vec3(1.0), dyeA, inA);
    T *= mix(vec3(1.0), dyeB, inB);
    // Interfaces: a dark refraction line with a bright focused rim inside.
    edgeA = exp(-a * a / (s * s * 1.5 + 0.004));
    edgeB = exp(-b * b / (s * s * 1.5 + 0.004));
    float rimA = exp(-pow((a - 2.5 * s) / (s * 1.2 + 0.03), 2.0));
    float rimB = exp(-pow((b - 2.5 * s) / (s * 1.2 + 0.03), 2.0));
    T *= 1.0 - 0.85 * max(edgeA, edgeB);
    T += (dyeA * rimA + dyeB * rimB) * 0.35;
    return T;
}

void main()
{
    vec2 p = screenP();
    float swell = clamp(audioSwell, 0.0, 1.0);
    float bass = clamp(audioBass, 0.0, 1.0);
    gRough = clamp(audioRoughness, 0.0, 1.0);
    gHeat = 0.08 * sceneTime + 0.8 * audioAdvance;
    gVisc = 0.8 + 0.6 * clamp(audioSpread, 0.0, 1.0);
    gBlob = swell;
    gSharp = mix(0.12, 0.03, clamp(focusP, 0.0, 1.0));
    float mag = 1.6 + 1.6 * clamp(scaleP, 0.0, 1.0);

    // Dyes: saturated colours from the photo (or a hue pair where it is grey);
    // the second dye sits across the colour wheel from the first.
    float h0 = hueP * 0.159 + 0.08 * clamp(audioMode, 0.0, 1.0);
    vec3 photoC = imgLod(vec2(0.5) + 0.25 * vec2(sin(0.01 * sceneTime), cos(0.013 * sceneTime)), 6.0);
    // Subtractive dyes like the real oils: bright colours that each absorb
    // one band (yellow, magenta, cyan family), a third of the wheel apart,
    // so their overlaps give the deep red, green and blue.
    float hA = (satOf(photoC) > 0.2) ? hue_of(photoC) : h0;
    vec3 dA = hsv2rgb(vec3(fract(hA), 0.85, 1.0));
    vec3 dB = hsv2rgb(vec3(fract(hA + 0.333), 0.85, 1.0));
    dA = 1.0 - (1.0 - dA) * 1.1; dB = 1.0 - (1.0 - dB) * 1.1;
    dA = clamp(dA * vec3(1.0) + (1.0 - max(dA.r, max(dA.g, dA.b))), 0.0, 1.0);
    dB = clamp(dB + (1.0 - max(dB.r, max(dB.g, dB.b))), 0.0, 1.0);

    int nP = 2 + int(clamp(projP, 0.0, 1.0) * 1.99);
    vec3 col = vec3(0.0);
    for (int k = 0; k < 3; ++k) {
        if (k >= nP) break;
        float fk = float(k);
        // Each projector: its own wheel angle and a light circle on the wall.
        vec2 c = vec2(0.55 * (fk - 0.5 * float(nP - 1)), 0.08 * sin(fk * 2.3));
        float wheelA = 0.015 * sceneTime * (fk == 1.0 ? -1.0 : 1.0) + 0.3 * audioPhase + fk * 2.1;
        vec2 q = rot2(wheelA) * (p - c) * mag + vec2(fk * 11.0, 0.0);
        // Lens dispersion: each channel sees the wheel slightly shifted
        // radially, which gives the rainbow fringes on the interfaces.
        vec2 disp = (p - c) * 0.012 * mag;
        float eA, eB, e2, e3;
        vec3 tR = wheel(q + disp, dA, dB, eA, eB);
        vec3 tG = wheel(q, dA, dB, e2, e3);
        vec3 tB = wheel(q - disp, dA, dB, e2, e3);
        vec3 T = vec3(tR.r, tG.g, tB.b);
        // Air bubbles: round, bright core, dark refraction ring, drifting with the heat.
        vec2 bq = q * 1.8 + vec2(gHeat * 0.4, -gHeat * 0.25), bi = floor(bq), bf = fract(bq);
        vec2 bc = 0.25 + 0.5 * hash22(bi);
        float br = 0.08 + 0.14 * hash21(bi + 3.0);
        float bd = length(bf - bc) / br;
        float has = step(1.0 - 0.18 * clamp(bubbleP, 0.0, 1.0), hash21(bi + 7.0));
        float ring = exp(-pow((bd - 0.92) / 0.07, 2.0));
        T = mix(T, T * 0.25, has * ring);
        T += vec3(1.0) * has * 0.35 * smoothstep(0.35, 0.0, length(bf - bc - vec2(-0.25, 0.25) * br) / br);
        // The projector's light circle: soft edge, a hot centre.
        float d = length(p - c);
        float lamp = smoothstep(0.95, 0.45, d) * (0.85 + 0.3 * exp(-d * d * 3.0));
        col += T * lamp * (0.55 + 0.4 * bass);
    }
    // Overlapping projectors add up; a little stray light on the wall between.
    col = col / (1.0 + 0.25 * float(nP - 1)) + vec3(0.02, 0.015, 0.03);
    col = mix(vec3(luma(col)), col, 1.25);                 // the dyes glow rich on the wall
    finish(col * 1.05);
}
