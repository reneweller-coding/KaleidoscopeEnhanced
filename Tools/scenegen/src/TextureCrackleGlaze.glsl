//@doc
 * @brief TEXTURE CRACKLE GLAZE: a glazed ceramic surface with the photograph
 * fired into it -- a thick glossy glaze covers the picture, crazed by a
 * web of fine cracks at two scales, and molten gold slowly seeps into the
 * cracks like kintsugi, running along them, filling some and leaving
 * others dark, then fading as new veins fill; the glaze pools deeper in
 * the photo's hollows and catches a gliding light.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the gold runs along the cracks (integrated)
 *   audioSpread     -> how many cracks carry gold
 *   audioKick       -> the gold flares (light)
 *   audioMode       -> the glaze: celadon in minor, warm ivory in major
 *   audioRoughness  -> the fine crazing
 *   audioSwell      -> the glaze depth (slow)
 *
 * Knobs: crackP (crack scale), goldP (gold brightness), glazeP (glaze tint), hueP.
//@params crackP goldP glazeP
//@audio audioSpread audioKick audioMode audioRoughness audioSwell
//@body
// Voronoi crack distance (F2 - F1) and the cell id.
vec2 crackle(vec2 x, out vec2 cid)
{
    vec2 i = floor(x), f = fract(x);
    float f1 = 9.0, f2 = 9.0; cid = i;
    for (int y = -1; y <= 1; ++y) for (int xx = -1; xx <= 1; ++xx) {
        vec2 o = vec2(xx, y);
        vec2 c = o + 0.1 + 0.8 * hash22(i + o);
        float d = length(f - c);
        if (d < f1) { f2 = f1; f1 = d; cid = i + o; } else if (d < f2) f2 = d;
    }
    return vec2(f2 - f1, f1);
}

void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    vec2 uv = p * 0.6 + 0.5 + vec2(0.002, 0.001) * sceneTime;
    vec3 ph = imgLod(uv, 0.8);
    float cs = 4.0 + 5.0 * clamp(crackP, 0.0, 1.0);
    vec2 w = p * cs + 0.3 * vec2(fbm3(p * 2.0), fbm3(p * 2.0 + 4.0));
    vec2 id1, id2;
    vec2 c1 = crackle(w, id1);
    vec2 c2 = crackle(w * 3.1 + 7.0, id2);
    float px = fwidth(w.x) + 1e-4;
    float crack1 = smoothstep(px * 2.0, 0.0, c1.x);
    float crack2 = smoothstep(px * 4.0, 0.0, c2.x) * (0.3 + 0.7 * rough);
    // Gold: runs along the big cracks; which cracks and how far is a slow field.
    float T = 0.04 * sceneTime + 0.3 * audioAdvance;
    float runField = fbm3(p * 1.2 + vec2(T, -0.5 * T));
    float carry = smoothstep(0.6 - 0.25 * clamp(audioSpread, 0.0, 1.0), 0.75, runField);
    float gold = crack1 * carry;
    float goldWide = smoothstep(px * 5.0, 0.0, c1.x) * carry;
    // The glaze over the photo: tinted, glossy, deeper in the hollows.
    vec3 glazeC = mix(vec3(0.75, 0.9, 0.82), vec3(1.0, 0.95, 0.85), mode);
    float hollow = 1.0 - luma(imgLod(uv, 4.0));
    vec3 col = mix(ph, ph * glazeC, 0.4 + 0.4 * clamp(glazeP, 0.0, 1.0));
    col = mix(col, glazeC * luma(col) * 1.2, (0.15 + 0.25 * swell) * hollow);
    // Each crackle cell tilts a little: slightly different gloss.
    col *= 0.93 + 0.1 * hash21(id1);
    // Dark cracks (dirt), gold cracks.
    col *= 1.0 - 0.6 * crack1 * (1.0 - carry) - 0.35 * crack2;
    vec3 goldC = vec3(1.0, 0.78, 0.35);
    goldC = mix(goldC, goldC * glowColour(imgLod(uv, 5.0), p, hueP * 0.159) * 1.3, 0.15);
    float gl = (0.8 + 0.8 * clamp(goldP, 0.0, 1.0)) * (1.0 + 1.2 * kick);
    col = mix(col, goldC * gl, gold);
    col += goldC * goldWide * 0.15 * gl;
    // Gloss highlight gliding over the glaze.
    vec2 hd = vec2(0.6 * sin(0.03 * sceneTime), 0.3 * cos(0.023 * sceneTime));
    float hl = exp(-dot(p - hd, p - hd) * 5.0) * (0.6 + 0.4 * hash21(id1));
    col += vec3(1.0) * hl * 0.18;
    finish(col);
}
