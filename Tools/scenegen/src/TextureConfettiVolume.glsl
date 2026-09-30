//@doc
 * @brief TEXTURE CONFETTI VOLUME: flying through a slow storm of glittering
 * confetti -- countless small metallic flakes (squares, circles and
 * strips) tumble toward the viewer in deep perspective, each catching the
 * light only when it turns flat to us, so the air sparkles in waves; the
 * flakes carry the photograph's colours, far ones tiny and dim, near ones
 * sailing past large and soft.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the flight through the confetti (integrated, jump-free)
 *   audioSpread     -> the flakes swirl wider
 *   audioKick       -> a wave of flashes (light)
 *   audioMode       -> palette: silver and blue in minor, gold and red in major (tint)
 *   audioHigh       -> sparkle (light)
 *   audioSwell      -> the glow of the air (slow)
 *
 * Knobs: densityP (flakes), sizeP (flake size), photoP (photo colours), hueP.
//@params densityP sizeP photoP
//@audio audioSpread audioKick audioMode audioHigh audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float travel = 0.4 * sceneTime + 3.0 * audioAdvance;
    vec3 col = glowColour(imgLod(vec2(0.5), 6.0), p, hueP * 0.159) * (0.02 + 0.06 * swell) * exp(-length(p));
    // Depth slices: each slice a layer of flakes at depth z (cycling toward the viewer).
    float pxp = fwidth(p.x);                                    // derivatives before any branch
    const int NS = 10;
    float dz = 1.0;
    float z0 = fract(travel / dz);
    for (int i = NS - 1; i >= 0; --i) {                         // far to near
        float fi = float(i);
        float z = (fi + 1.0 - z0) * dz;                         // depth of this slice
        float sliceId = floor(travel / dz) + fi;
        float fade = smoothstep(float(NS) * dz, float(NS) * dz - 2.0, z) * smoothstep(0.2, 0.6, z);
        vec2 q = p * z * (3.0 - 1.5 * clamp(sizeP, 0.0, 1.0));   // perspective: the slice's plane
        float swirl = (0.2 + 0.5 * clamp(audioSpread, 0.0, 1.0));
        q += swirl * vec2(sin(sliceId * 1.3 + 0.2 * sceneTime), cos(sliceId * 0.7 - 0.15 * sceneTime));
        vec2 gi = floor(q);
        vec2 f = fract(q) - 0.5;
        float h = hash21(gi + sliceId * 7.13);
        if (h > 0.25 + 0.5 * clamp(densityP, 0.0, 1.0)) continue;
        vec2 c = 0.3 * (hash22(gi + sliceId) - 0.5);
        float rot = sceneTime * (1.0 + 2.0 * h) + h * 6.28;
        float flip = cos(sceneTime * (1.3 + 2.0 * fract(h * 7.0)) + h * 11.0);
        vec2 l = rot2(rot) * (f - c);
        l.y /= max(abs(flip), 0.1);
        float kind = fract(h * 13.0);
        float s = 0.12;
        float sd;
        if (kind < 0.4) sd = max(abs(l.x), abs(l.y)) - s;                           // square
        else if (kind < 0.7) sd = length(l) - s;                                    // circle
        else sd = max(abs(l.x) - s * 2.0, abs(l.y) - s * 0.35);                     // strip
        float px = pxp * z * (3.0 - 1.5 * clamp(sizeP, 0.0, 1.0)) * 1.2;
        float flake = smoothstep(px, -px, sd);
        if (flake <= 0.0) continue;
        vec3 pc = imgLod(gi * 0.07 + 0.5 + sliceId * 0.013, 3.0);
        vec3 metal = mix(mix(vec3(0.75, 0.8, 0.9), vec3(0.3, 0.45, 0.9), step(0.5, fract(h * 3.0))), mix(vec3(1.0, 0.78, 0.3), vec3(0.9, 0.2, 0.2), step(0.5, fract(h * 3.0))), mode);
        vec3 fc = mix(metal, glowColour(pc, gi, hueP * 0.159), clamp(photoP, 0.0, 1.0) * 0.7);
        // Glint when it turns flat toward us.
        float glint = pow(abs(flip), 80.0);
        float wave = kick * exp(-pow(fract(sliceId * 0.1 - sceneTime * 0.2) - 0.5, 2.0) * 20.0);
        vec3 c3 = fc * (0.35 + 0.4 * abs(flip)) + mix(fc, vec3(1.0), 0.5) * glint * (0.5 + 1.0 * hi + 2.0 * wave);
        col = mix(col, c3 * fade, flake * fade);
    }
    finish(col);
}
