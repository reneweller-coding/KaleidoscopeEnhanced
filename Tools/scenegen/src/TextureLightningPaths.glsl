//@doc
 * @brief TEXTURE LIGHTNING PATHS: electricity crawling through the photograph
 * -- branching bolts of blue-white lightning run along the dark cracks and
 * valleys of the texture, as if the photo were a slab of stone charged
 * from within: the bolts flicker along their paths, fork into finer
 * branches, and light up the surrounding stone in cold violet, then fade
 * and strike again elsewhere.  The surface itself is dark, only lit by the
 * discharges and a faint afterglow along the paths.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioKick       -> a discharge (light only)
 *   audioAdvance    -> the discharges wander to new paths (integrated)
 *   audioSpread     -> how many of the fine branches carry current
 *   audioRoughness  -> the bolts jitter along their paths
 *   audioMode       -> the colour: violet in minor, cyan-white in major
 *   audioSwell      -> the afterglow along the paths (slow)
 *
 * Knobs: scaleP, branchP (branch density), stoneP (how much stone is lit), hueP.
//@params scaleP branchP stoneP
//@audio audioKick audioSpread audioRoughness audioMode audioSwell
//@body
// A thin line along the isoline n = 0.5 of a field, of pixel width w.
float isoLine(float n, vec2 grad, float w)
{
    return exp(-pow(abs(n - 0.5) / (length(grad) * w + 1e-4), 2.0));
}

void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    float sc = 1.2 + 1.5 * clamp(scaleP, 0.0, 1.0);
    vec2 q = p * sc;
    vec2 uv = p * 0.7 + 0.5 + vec2(0.002, 0.0015) * sceneTime;
    // The field whose isolines are the bolts: noise warped by the photo, so
    // the bolts follow the photo's structure.
    float T = 0.05 * sceneTime + 0.5 * audioAdvance;
    vec2 warp = vec2(luma(imgLod(uv, 4.0)), luma(imgLod(uv + 0.37, 4.0))) - 0.5;
    vec2 wq = q + warp * 1.5 + 0.02 * rough * vec2(noise2(q * 60.0 + sceneTime * 12.0), noise2(q * 60.0 - sceneTime * 12.0));
    float e = 0.002;
    float n1 = fbm(wq + vec2(T, 0.0));
    vec2 g1 = vec2(fbm(wq + vec2(T + e, 0.0)) - n1, fbm(wq + vec2(T, e)) - n1) / e;
    float n2 = fbm(wq * 2.3 + 7.0 - vec2(0.0, T));
    vec2 g2 = vec2(fbm((wq + vec2(e, 0.0)) * 2.3 + 7.0 - vec2(0.0, T)) - n2, fbm((wq + vec2(0.0, e)) * 2.3 + 7.0 - vec2(0.0, T)) - n2) / e;
    float px = sc / resolution.y;
    float trunk = isoLine(n1, g1, px * 1.2);
    // Branches only near the trunk (they fork off it).
    float nearTrunk = exp(-pow(abs(n1 - 0.5) / 0.06, 2.0));
    float branch = isoLine(n2, g2, px * 0.8) * nearTrunk * (0.3 + 0.7 * clamp(branchP, 0.0, 1.0)) * (0.4 + 0.6 * clamp(audioSpread, 0.0, 1.0));
    // Which stretches are live now: a wandering charge; flicker along the bolt.
    float charge = smoothstep(0.3, 0.6, fbm3(p * 1.2 + vec2(0.09 * sceneTime + audioAdvance, 0.0)));
    float flick = 0.6 + 0.4 * noise2(vec2(sceneTime * 9.0, n1 * 30.0));
    float I = charge * flick * (0.5 + 1.6 * kick);
    float mode = clamp(audioMode, 0.0, 1.0);
    vec3 boltC = mix(vec3(0.65, 0.5, 1.0), vec3(0.6, 0.95, 1.0), mode);
    boltC = mix(boltC, glowColour(imgLod(uv, 6.0), p, hueP * 0.159), 0.15);
    // The dark stone (the photo), lit around the live bolts.
    vec3 stone = imgLod(uv, 1.0) * 0.14;
    vec3 col = stone * (1.0 + 3.0 * clamp(stoneP, 0.0, 1.0) * nearTrunk * I);
    col += boltC * exp(-pow(abs(n1 - 0.5) / 0.04, 2.0)) * I * 0.6;         // glow around the bolt
    col += mix(boltC, vec3(1.0), 0.6) * (trunk + branch * 0.8) * I * 2.4;
    col += boltC * trunk * 0.08 * (0.4 + 0.8 * swell);                        // faint afterglow everywhere
    finish(col);
}
