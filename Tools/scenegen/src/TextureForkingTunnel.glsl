//@doc
 * @brief TEXTURE FORKING TUNNEL: a tunnel that keeps branching -- ahead of
 * us the passage splits into two (or three) smaller tunnels, and we drift
 * toward one of them; as we enter it, it grows to fill the view and
 * splits again, and again, forever, like flying down the branches of a
 * tree of caves; the walls are lined with the photograph, the branch
 * openings glow.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the descent into the branches (integrated, jump-free)
 *   audioPhase      -> the fork pattern turns (integrated)
 *   audioSpread     -> the openings widen
 *   audioKick       -> the openings flare (light)
 *   audioMode       -> the glow in the openings: cool in minor, warm in major
 *   audioSwell      -> the glow in the openings (slow)
 *
 * Knobs: forkP (fork spread), wallZoomP, rimP (opening rims), hueP.
//@params forkP wallZoomP rimP
//@audio audioPhase audioSpread audioKick audioMode audioSwell
//@body
// One level: a tunnel wall with n openings arranged around the centre.
// Returns the colour; 'hole' is 1 inside an opening, and 'local' the
// coordinates inside that opening (for the next level).
vec3 level(vec2 q, float n, float rot, float spread, float openR, float lev, out float hole, out vec2 local)
{
    float r = max(length(q), 1e-4);
    float a = atan(q.y, q.x);
    vec2 cs = vec2(cos(a), sin(a));
    // Openings centres.
    hole = 0.0; local = q;
    float best = 1e3;
    for (int k = 0; k < 3; ++k) {
        if (float(k) >= n) break;
        float ang = rot + float(k) * 6.2831853 / n;
        vec2 c = spread * vec2(cos(ang), sin(ang));
        float d = length(q - c);
        if (d < best) { best = d; local = (q - c) / openR; }
    }
    hole = smoothstep(openR * 1.02, openR * 0.98, best);
    // The wall: tunnel perspective toward the fork (depth grows toward the openings).
    float z = 0.25 / max(best - openR * 0.9, 0.02);
    float zoom = 0.3 + 0.4 * clamp(wallZoomP, 0.0, 1.0);
    vec2 uv = vec2(a / 3.14159265, z * zoom * 0.2 + lev * 0.37);
    vec3 wall = imgLod(uv, clamp(1.0 + z * 0.3, 0.0, 6.0));
    vec3 col = wall * (0.3 + 0.7 * exp(-z * 0.05)) * smoothstep(0.02, 0.4, best - openR * 0.9);
    // Rim of each opening.
    float rim = exp(-abs(best - openR) / (0.01 + 0.02 * clamp(rimP, 0.0, 1.0)));
    col += vec3(1.0) * rim * 0.15;
    return col;
}

void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = smoothstep(0.2, 0.8, clamp(audioMode, 0.0, 1.0));
    float spread = 0.25 + 0.1 * clamp(forkP, 0.0, 1.0);
    float openR = 0.16 + 0.05 * clamp(audioSpread, 0.0, 1.0);
    // Zoom factor per level: so large that at the end of a level its target
    // opening fills the whole view (the next level then starts exactly there).
    float K = 1.15 / openR;
    float T = 0.12 * sceneTime + 0.8 * audioAdvance;
    float f = fract(T);
    float L0 = floor(T);
    // Continuous zoom toward the chosen opening of level 0: position the
    // view between level L0 (at f=0) and inside its target opening (at f=1).
    float rot0 = 0.1 * sceneTime + 0.5 * audioPhase;
    float n = 3.0;                                              // fixed count (no jump)
    // The target opening of this level (per level index), so the path is deterministic.
    float tk = floor(hash11(L0 * 0.731) * n);
    float tAng = rot0 + L0 * 1.3 + tk * 6.2831853 / n;
    vec2 tc = spread * vec2(cos(tAng), sin(tAng));
    float s = pow(K, f);                                        // zoom
    // Zoom toward tc so that at f = 1 the opening frame equals the next level at f = 0.
    vec2 q = tc * (1.0 - 1.0 / s) / (1.0 - 1.0 / K) + p / s;
    vec3 col = vec3(0.0);
    float trans = 1.0;
    vec3 gc = glowColour(imgLod(vec2(0.5), 6.0), vec2(T * 0.1, 0.0), hueP * 0.159);
    gc = mix(gc, gc * mix(vec3(0.8, 0.9, 1.2), vec3(1.2, 0.9, 0.75), mode), 0.5);
    for (int i = 0; i < 4; ++i) {
        float lev = L0 + float(i);
        float rotL = rot0 + lev * 1.3;
        float hole; vec2 local;
        vec3 c = level(q, n, rotL, spread, openR, lev, hole, local);
        col += trans * (1.0 - hole) * c;
        trans *= hole;
        if (trans < 0.01) break;
        // Into the opening: map to the next level's frame.
        q = local * openR * K;                                  // the opening becomes the next level's frame
    }
    col += trans * gc * (0.5 + 0.8 * swell) * (1.0 + kick);
    finish(col);
}
