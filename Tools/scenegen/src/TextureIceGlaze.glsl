//@doc
 * @brief TEXTURE ICE GLAZE: the photograph frozen under a sheet of clear ice
 * -- trapped air bubbles in strings and clouds, white fracture planes
 * cutting through the ice at angles (flashing when the light catches
 * them), the picture below bent and cooled by the ice's thickness, and
 * frost feathers growing at the edges of the cracks; a cold light slides
 * across the surface.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the light slides (integrated, jump-free)
 *   audioSpread     -> ice thickness (more bending)
 *   audioKick       -> the fracture planes flash (light)
 *   audioMode       -> the ice: blue-green in minor, clear-white in major
 *   audioHigh       -> the bubbles sparkle (light)
 *   audioSwell      -> frost at the cracks (slow)
 *
 * Knobs: crackP (fractures), bubbleP (trapped air), photoP (photo clarity), hueP.
//@params crackP bubbleP photoP
//@audio audioSpread audioKick audioMode audioHigh audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    vec2 uv = p * 0.5 + 0.5;
    // Ice thickness varies; the photo bends through it.
    float th = (0.5 + 0.8 * clamp(audioSpread, 0.0, 1.0)) * (0.5 + fbm3(p * 1.2));
    vec2 bend = (vec2(fbm3(p * 2.0), fbm3(p * 2.0 + 5.0)) - 0.5) * 0.04 * th;
    vec3 ph = imgK(uv + bend, 1.0 + 2.0 * (1.0 - clamp(photoP, 0.0, 1.0)));
    vec3 iceC = mix(vec3(0.6, 0.85, 0.9), vec3(0.92, 0.95, 1.0), mode);
    vec3 col = ph * iceC * (0.9 - 0.25 * th);
    // Fracture planes: straight cracks (voronoi-ish lines at angles), each a thin bright plane.
    float T = 0.05 * sceneTime + 0.35 * audioAdvance;
    float S = 1.5 + 2.0 * clamp(crackP, 0.0, 1.0);
    // Fractures are crooked, not a clean honeycomb: warp the cell lattice.
    vec2 g = p * S + 0.35 * vec2(fbm3(p * 2.5 + 1.0), fbm3(p * 2.5 + 6.0));
    vec2 gi = floor(g), gf = fract(g);
    float f1 = 9.0, f2 = 9.0;
    for (int y = -1; y <= 1; ++y) for (int x = -1; x <= 1; ++x) {
        vec2 o = vec2(x, y);
        vec2 c = o + 0.1 + 0.8 * hash22(gi + o);
        float d = length(gf - c);
        if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
    }
    float keep = step(0.35, hash21(gi + floor(f1 * 3.0)));      // not every cell wall has cracked
    float crack = exp(-(f2 - f1) / 0.02) * (0.4 + 0.6 * keep);
    // Each plane flashes when the moving light faces it.
    float face = pow(max(0.0, sin(T * 2.0 + dot(gi, vec2(1.7, 2.3)))), 8.0);
    col += vec3(0.95, 0.98, 1.0) * crack * (0.2 + (0.6 + 1.5 * kick) * face);
    // Frost feathers along the cracks.
    float frost = smoothstep(0.12, 0.0, f2 - f1) * smoothstep(0.45, 0.7, fbm3(p * 30.0)) * (0.2 + 0.8 * swell);
    col = mix(col, vec3(0.9, 0.95, 1.0), frost * 0.6);
    // Trapped bubbles: round, in strings.
    vec2 bg = p * 50.0 + vec2(0.0, 3.0 * fbm3(p * 2.0));
    vec2 bi = floor(bg);
    vec2 bc = 0.25 + 0.5 * hash22(bi);
    float br = 0.08 + 0.15 * hash21(bi + 1.0);
    float bd = length(fract(bg) - bc) / br;
    float along = smoothstep(0.55, 0.7, fbm3(p * 3.0 + 9.0));
    float isB = step(hash21(bi + 2.0), (0.1 + 0.5 * clamp(bubbleP, 0.0, 1.0)) * along);
    float rim = smoothstep(0.7, 1.0, bd) * smoothstep(1.2, 1.0, bd);
    col = mix(col, col * 0.7, isB * smoothstep(1.0, 0.8, bd) * 0.3);
    col += vec3(0.95, 0.98, 1.0) * isB * (rim * 0.5 + smoothstep(0.35, 0.1, length((fract(bg) - bc) / br - vec2(-0.3, 0.3))) * (0.3 + 1.2 * hi));
    // The sliding light: a soft gleam across the surface.
    float gl = exp(-pow(dot(p, vec2(0.7, 0.7)) - 1.5 * sin(T), 2.0) * 4.0);
    col += iceC * gl * 0.12;
    col = mix(col, col * glowColour(ph, p, hueP * 0.159) * 1.2, 0.05);
    finish(col);
}
