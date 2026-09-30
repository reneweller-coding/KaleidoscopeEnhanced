//@doc
 * @brief TEXTURE GLASS CUBE SWARM: a swarm of clear glass cubes tumbling
 * slowly through space in front of the photograph -- each cube refracts the
 * photo behind it into a shifted, magnified, chromatically fringed tile,
 * its edges bright, its faces tinted by the thickness of glass, near cubes
 * large and sharp, far ones small; they turn slowly on their own axes so
 * the refracted tiles slide and flip.  The photo behind drifts; the field
 * of cubes is endless.  Mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the swarm drifts (integrated, jump-free)
 *   audioPhase      -> the cubes turn (integrated)
 *   audioSpread     -> refraction strength
 *   audioMode       -> the glass tint warms in major
 *   audioHigh       -> the edges glint (light)
 *   audioSwell      -> the light behind (slow)
 *
 * Knobs: countP (how many cubes), sizeP, dispP (colour fringing), hueP.
//@params countP sizeP dispP
//@audio audioPhase audioSpread audioMode audioHigh audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    vec2 drift = vec2(0.01, 0.006) * sceneTime;
    vec2 base = p * 0.7 + 0.5 + drift;
    vec3 bg = imgLod(base, 2.5) * (0.55 + 0.4 * swell);
    bg = mix(bg, glowColour(bg, base, hueP * 0.159) * (0.4 + 0.8 * luma(bg)), 0.35);
    vec3 col = bg;
    vec3 tint = mix(vec3(0.85, 0.95, 1.0), vec3(1.0, 0.95, 0.85), clamp(audioMode, 0.0, 1.0));
    float refr = 0.08 + 0.18 * clamp(audioSpread, 0.0, 1.0);
    float disp = 0.002 + 0.008 * clamp(dispP, 0.0, 1.0);
    // Layers far to near; each a jittered grid of cubes.
    for (int L = 2; L >= 0; --L) {
        float fl = float(L);
        float z = 1.0 + fl * 0.8;
        float cell = (0.2 + 0.15 * clamp(sizeP, 0.0, 1.0)) / z * 1.6;
        vec2 g = p / cell + vec2(0.03 * sceneTime + 0.3 * audioAdvance, 0.02 * sceneTime) * (2.0 / z) + fl * 11.0;
        vec2 gi = floor(g);
        for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
            vec2 id = gi + vec2(i, j);
            if (hash21(id + fl * 5.0) > 0.25 + 0.4 * clamp(countP, 0.0, 1.0)) continue;
            vec2 c = id + 0.5 + 0.2 * (hash22(id + fl) - 0.5);
            float ang = hash21(id + 2.0) * 6.28 + (0.1 + 0.1 * hash21(id + 4.0)) * (sceneTime * 0.5 + 3.0 * audioPhase);
            vec2 d = rot2(ang) * (g - c);
            float s = 0.3 + 0.1 * hash21(id + 6.0);
            // A cube seen at a tilt: a rounded square whose faces refract differently.
            vec2 ad = abs(d) - s;
            float box = length(max(ad, 0.0)) + min(max(ad.x, ad.y), 0.0) - 0.03;
            float aa = 1.5 / resolution.y / cell;
            float inside = smoothstep(aa, -aa, box);
            if (inside <= 0.0) continue;
            // Refraction offset: depends on which face (the tilt of the cube).
            vec2 face = sign(d) * smoothstep(0.0, s, abs(d));
            vec2 off = (rot2(-ang) * face) * refr / z;
            vec3 rc = vec3(imgLod(base + off * (1.0 + disp / refr * 4.0), 2.0).r,
                           imgLod(base + off, 2.0).g,
                           imgLod(base + off * (1.0 - disp / refr * 4.0), 2.0).b);
            rc = mix(rc, glowColour(rc, base + off, hueP * 0.159) * (0.4 + 0.8 * luma(rc)), 0.35);
            rc *= tint * (0.9 + 0.3 * swell);
            // Edges: bright rims; inner face seams.
            float edge = smoothstep(0.05, 0.0, abs(box + 0.02));
            float seam = smoothstep(0.02, 0.0, min(abs(d.x), abs(d.y))) * 0.4;
            rc += vec3(1.0) * (edge * (0.4 + 0.9 * hi) + seam * 0.3);
            // Distance fade toward the background.
            rc = mix(rc, bg, fl * 0.2);
            col = mix(col, rc, inside);
        }
    }
    finish(col);
}
