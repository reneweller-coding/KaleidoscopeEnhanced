//@doc
 * @brief NEON RING TUNNEL: flying through a tunnel of neon tubes -- ring after
 * ring of glowing tubes rush past, but the rings are not circles: each
 * ring's outline is traced from the photograph's contours around the tunnel
 * axis, so they buckle and notch like hand-bent neon, and every ring glows
 * in its own colour from the photo, with a halo in the haze and a
 * reflection smeared across the wet walls between.  Endless polar field.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the flight (integrated, jump-free)
 *   audioPhase      -> the rings turn (integrated)
 *   audioSpread     -> throat depth
 *   audioRoughness  -> the rings buckle more
 *   audioKick       -> a ring flares as it passes (light)
 *   audioSwell      -> the haze (slow)
 *
 * Knobs: ringsP (ring spacing), bendP (how much the photo bends the rings),
 * thickP (tube thickness), hueP.
//@params ringsP bendP thickP
//@audio audioPhase audioSpread audioRoughness audioKick audioSwell
//@body
void main()
{
    vec2 p = screenP() * 3.0;
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float r = length(p);
    float a = atan(p.y, p.x) + 0.02 * sceneTime + 0.3 * audioPhase;
    vec2 dir = vec2(cos(a), sin(a));
    float throat = 0.5 * (0.8 + 0.4 * clamp(audioSpread, 0.0, 1.0));
    float z = throat / max(r, 1e-3);
    float u = z + 0.5 * sceneTime + 2.0 * audioAdvance;
    float sp = 0.12 + 0.18 * clamp(ringsP, 0.0, 1.0);
    vec3 col = vec3(0.01, 0.01, 0.02);
    // Rings near this depth: the current one and its neighbours.
    for (int k = -1; k <= 2; ++k) {
        float ri = floor(u / sp) + float(k);
        // The ring's bend: the photo's brightness around a circle, per ring.
        vec2 buv = dir * 0.2 + vec2(ri * 0.137, ri * 0.071) + 0.5;
        float bend = (luma(imgLod(buv, 5.5)) - 0.5) * (0.8 + 2.0 * clamp(bendP, 0.0, 1.0));
        bend += 0.08 * clamp(audioRoughness, 0.0, 1.0) * (noise2(dir * 3.0 + ri) - 0.5);
        float du = (u - (ri + 0.5) * sp) - bend * sp;
        // Distance on screen: du in depth units -> screen via r^2/throat.
        float ds = abs(du) * r * r / throat;
        float fade = smoothstep(0.03, 0.25, r);
        float w = (0.004 + 0.008 * clamp(thickP, 0.0, 1.0)) * (r + 0.1);
        vec3 ph = imgLod(vec2(ri * 0.213, ri * 0.117) + 0.5, 5.0);
        vec3 nc = hsv2rgb(vec3(fract((satOf(ph) > 0.2 ? hue_of(ph) : hueP * 0.159) + ri * 0.13), 0.85, 1.0));
        float flare = 1.0 + 1.2 * kick * exp(-pow((u - (ri + 0.5) * sp) * 3.0, 2.0));
        col += mix(nc, vec3(1.0), 0.5) * exp(-ds * ds / (w * w)) * 1.4 * flare * fade;
        col += nc * exp(-ds / (w * 5.0)) * 0.35 * (0.6 + 0.8 * swell) * flare * fade;
        // the wet wall between the rings catches their light
        col += nc * exp(-abs(du) / sp * 2.0) * 0.05 * (0.5 + 0.8 * swell) * fade;
    }
    // Far rings melt into a glow; near the rim the tunnel wall reflects them.
    col += vec3(0.2, 0.15, 0.3) * exp(-r * 4.0) * (0.3 + 0.5 * swell);
    finish(col);
}
