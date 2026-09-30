//@doc
 * @brief TEXTURE SHARD CLOUD: a slowly tumbling cloud of glass shards -- a
 * shattered pane of the photograph floats in the dark, hundreds of
 * triangular fragments drifting apart and together, each tilted its own
 * way so it shows its piece of the picture slightly shifted and flashes a
 * bright edge when it turns toward the light; fragments at different
 * depths drift at different speeds, the far ones smaller and dimmer.
 * Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the shards drift (integrated, jump-free)
 *   audioSpread     -> the pane breaks further apart
 *   audioKick       -> edge flashes (light)
 *   audioMode       -> the light: cool in minor, warm in major
 *   audioHigh       -> sparkles on the edges (light)
 *   audioSwell      -> depth haze (slow)
 *
 * Knobs: shardP (shard size), layerP (depth layers), tiltP (tumbling), hueP.
//@params shardP layerP tiltP
//@audio audioSpread audioKick audioMode audioHigh audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    vec3 lc = mix(vec3(0.75, 0.88, 1.1), vec3(1.12, 0.92, 0.72), mode);
    vec3 col = vec3(0.01, 0.012, 0.02);
    float nL = 2.0 + 2.0 * clamp(layerP, 0.0, 1.0);
    float T = 0.03 * sceneTime + 0.25 * audioAdvance;
    float gap = 0.04 + 0.2 * clamp(audioSpread, 0.0, 1.0);
    for (int L = 3; L >= 0; --L) {                              // far to near
        float fl = float(L);
        float on = smoothstep(fl - 0.5, fl + 0.5, nL - 0.5);
        if (on <= 0.0) continue;
        float depth = 1.0 + fl * 0.7;
        float S = (3.0 + 3.0 * (1.0 - clamp(shardP, 0.0, 1.0))) * depth;
        // Each layer's lattice turned its own way, drifting.
        vec2 q = rot2(fl * 0.9 + 0.3) * p * S + vec2(T * (1.0 + 0.3 * fl), 0.3 * T) * 3.0 + fl * 11.0;
        // Equilateral triangles: skewed lattice, each rhombus split in two.
        vec2 sk = vec2(q.x - q.y * 0.57735, q.y * 1.1547);
        vec2 ci = floor(sk);
        vec2 ff = fract(sk);
        float tri = step(1.0, ff.x + ff.y);                      // which triangle of the rhombus
        vec2 id = ci * 2.0 + vec2(tri, 0.0);
        // Distance to the triangle's edges (barycentric, in skewed units ~ true for equilateral).
        float ed = tri > 0.5 ? min(min(1.0 - ff.x, 1.0 - ff.y), ff.x + ff.y - 1.0) : min(min(ff.x, ff.y), 1.0 - ff.x - ff.y);
        ed *= 0.866;
        vec2 f = ff;
        float px = fwidth(sk.x) * 1.2;
        float inside = smoothstep(gap * 0.5, gap * 0.5 + px, ed);
        // Each shard's tilt shifts its piece of the picture and changes its light.
        float h = hash21(id + fl * 3.0);
        float tilt = (0.3 + 0.7 * clamp(tiltP, 0.0, 1.0));
        float ang = T * 4.0 * (h - 0.5) + h * 6.28;
        vec2 tdir = vec2(cos(ang), sin(ang)) * tilt;
        vec2 uv = q / S * 0.7 + 0.5 + tdir * 0.03;
        vec3 ph = imgLod(uv, 0.8 + fl * 0.5);
        float facing = 0.5 + 0.5 * sin(ang * 1.3 + h * 3.0);
        vec3 sc = ph * lc * (0.45 + 0.7 * facing);
        vec3 gc = glowColour(ph, id, hueP * 0.159);
        float edge = exp(-(ed - gap * 0.5) / (px * 2.0 + 0.01)) * inside;
        sc += mix(gc, vec3(1.0), 0.5) * edge * pow(facing, 4.0) * (0.5 + 1.5 * kick);
        float sparkle = pow(max(0.0, sin(sceneTime * 3.0 + h * 40.0)), 20.0) * edge;
        sc += vec3(1.0) * sparkle * hi;
        // Depth haze.
        float haze = (0.15 + 0.4 * swell) * fl / 3.0;
        sc = mix(sc, lc * 0.05, haze) / (1.0 + fl * 0.3);
        col = mix(col, sc, inside * on);
    }
    finish(col);
}
