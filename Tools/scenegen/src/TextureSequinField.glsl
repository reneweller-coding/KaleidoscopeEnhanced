//@doc
 * @brief TEXTURE SEQUIN FIELD: a wall of sequins that shows the photograph --
 * thousands of small round metal discs in overlapping rows like fish
 * scales, each tinted with the colour of the photo at its place, and waves
 * run across the wall that tip the sequins over: where a wave passes they
 * flip from the photo's colour to their bright metallic backs and catch
 * the light in a sweep of glints.  Several waves cross at once, curving
 * and interfering; the wall is endless and mirrors without seams.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the waves travel (integrated, jump-free)
 *   audioSpread     -> wave length: a wide spectrum makes more, shorter waves
 *   audioMode       -> the metallic backs: silver in minor, gold in major (slow blend)
 *   audioRoughness  -> the sequins shimmer out of step
 *   audioKick       -> the glints flare (light)
 *   audioSwell      -> how far the sequins tip (slow)
 *
 * Knobs: sizeP (sequin size), wavesP (how many wave sources), photoP
 * (how much of the photo shows), hueP.
//@params sizeP wavesP photoP
//@audio audioSpread audioMode audioRoughness audioKick audioSwell audioHigh
//@body
float gT;

// The tip angle of a sequin at position q (-1..1: front .. back).
float tipAt(vec2 q, int nW, float wl)
{
    float s = 0.0;
    for (int k = 0; k < 4; ++k) {
        if (k >= nW) break;
        float fk = float(k);
        vec2 src = vec2(sin(fk * 2.1 + 0.3) * 1.2, cos(fk * 1.7) * 0.8);
        float d = length(q - src);
        s += sin(d * wl - gT * (1.0 + 0.2 * fk) + fk * 1.3);
    }
    return s / float(nW);
}

void main()
{
    vec2 p = screenP();
    float swell = clamp(audioSwell, 0.0, 1.0);
    float kick = clamp(audioKick, 0.0, 1.0);
    float px = 1.0 / resolution.y;
    gT = 0.6 * sceneTime + 4.0 * audioAdvance;
    int nW = 2 + int(clamp(wavesP, 0.0, 1.0) * 2.99);
    float wl = 7.0 + 8.0 * clamp(audioSpread, 0.0, 1.0);

    // Sequins in offset rows; each overlaps the row below like scales.
    float cs = 0.028 + 0.03 * clamp(sizeP, 0.0, 1.0);
    vec3 col = vec3(0.02);
    float covered = 0.0;
    vec3 back = mix(vec3(0.85, 0.88, 0.95), vec3(1.0, 0.8, 0.45), clamp(audioMode, 0.0, 1.0));
    for (int r = 1; r >= -1; --r) {
        float row = floor(p.y / (cs * 0.8)) + float(r);
        float off = 0.5 * mod(row, 2.0);
        float cx = floor(p.x / cs - off) + 0.5 + off;
        for (int k = -1; k <= 1; ++k) {
            vec2 c = vec2((cx + float(k)) * cs, (row + 0.5) * cs * 0.8);
            vec2 d = p - c;
            float rad = cs * 0.62;
            float dist = length(d);
            if (dist > rad) continue;
            // Tip: the wave field at the sequin's centre, plus a little private shimmer.
            float t = tipAt(c, nW, wl) + 0.25 * clamp(audioRoughness, 0.0, 1.0) * sin(sceneTime * 3.0 + hash21(c * 91.0) * 30.0);
            float flip = smoothstep(-0.3, 0.3, t * (0.6 + 0.6 * swell));
            // Front: the photo's colour at this sequin (averaged over the disc).
            vec3 ph = imgLod(c * 0.9 + 0.5 + vec2(0.004, 0.0) * sceneTime, 3.0);
            vec3 front = mix(ph, glowColour(ph, c * 1.4, hueP * 0.159) * (0.4 + 0.8 * luma(ph)), 0.5) * mix(0.6, 1.4, clamp(photoP, 0.0, 1.0));
            // A disc tilting: its normal leans with the flip; specular sweep.
            float tilt = (flip - 0.5) * 1.6;
            vec2 jit = (hash22(c * 97.0) - 0.5) * 0.5;                   // every sequin hangs a little differently
            vec3 n = normalize(vec3(d / rad * 0.25 + jit + vec2(0.0, tilt), 1.0));
            vec3 L = normalize(vec3(-0.4, 0.6, 1.0));
            float spec = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 18.0);
            // Metallic back: mirrors a bright, coloured room (the photo's glow).
            vec3 env = glowColour(imgLod(n.xy * 0.4 + 0.5, 5.0), n.xy * 2.0, hueP * 0.159 + 0.3);
            vec3 metal = back * (0.35 + 0.9 * env * (0.5 + 0.5 * n.y)) + back * spec * 1.6;
            vec3 face = mix(front * (1.0 + 0.4 * spec), metal, flip);
            face += vec3(1.0) * spec * (0.3 + 1.2 * kick) * (0.3 + 0.7 * flip);
            // The hole in the middle and the edge shadow from the sequin above.
            face *= smoothstep(0.08, 0.14, dist / rad);
            face *= 0.7 + 0.3 * smoothstep(-0.2, 0.6, d.y / rad);
            float aa = px * 1.5;
            float cov = smoothstep(rad + aa, rad - aa, dist) * (1.0 - covered);
            col = mix(col, face, cov);
            covered = max(covered, cov);
        }
    }
    finish(col);
}
