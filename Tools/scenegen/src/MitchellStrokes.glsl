//@doc
 * @brief MITCHELL STROKES: Joan Mitchell's gestural abstraction, alive --
 * clusters of energetic, crisscrossing brushstrokes in vivid colours
 * (from the photograph) tangle over a white ground like a windblown
 * thicket, dense in the middle of each cluster and loosening toward its
 * edges, individual strokes whipping in and fading as the clusters slowly
 * drift and re-form.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> strokes whip in and fade (integrated, jump-free)
 *   audioSpread     -> the clusters spread
 *   audioKick       -> the colours brighten (light)
 *   audioMode       -> palette: blue-green-violet in minor, yellow-orange in major (tint)
 *   audioRoughness  -> the strokes become more agitated
 *   audioSwell      -> stroke density (slow)
 *
 * Knobs: clusterP (cluster count), strokeP (stroke length), photoP (photo colours), hueP.
//@params clusterP strokeP photoP
//@audio audioSpread audioKick audioMode audioRoughness audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    vec3 ground = vec3(0.95, 0.94, 0.9) * (0.97 + 0.03 * noise2(p * 300.0));
    vec3 col = ground;
    float T = 0.1 * sceneTime + 0.7 * audioAdvance;
    // Cluster density field.
    float S = 1.0 + 1.0 * clamp(clusterP, 0.0, 1.0);
    float cl = fbm3(p * S + vec2(0.02 * sceneTime, 0.0));
    float dens = smoothstep(0.45 - 0.15 * clamp(audioSpread, 0.0, 1.0), 0.7, cl) * (0.5 + 0.7 * swell);
    // Strokes: short thick segments on a jittered grid, each with its own direction.
    for (int L = 0; L < 3; ++L) {
        float fl = float(L);
        float G = 5.0 + 3.0 * fl;
        vec2 g = p * G + fl * 7.1;
        vec2 gi = floor(g);
        for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
            vec2 id = gi + vec2(i, j);
            float h = hash21(id + fl * 13.0);
            float cyc = T * (0.5 + 0.5 * h) + h * 4.0;
            float life = fract(cyc);
            float gen = floor(cyc);
            vec2 cw = (id + 0.5 - fl * 7.1) / G;
            float dLocal = smoothstep(0.45 - 0.15 * clamp(audioSpread, 0.0, 1.0), 0.7, fbm3(cw * S + vec2(0.02 * sceneTime, 0.0))) * (0.5 + 0.7 * swell);
            if (hash21(id + gen * 1.7 + fl) > dLocal) continue;
            vec2 c = id + 0.5 + 0.3 * (hash22(id + gen) - 0.5);
            float ang = (hash21(id + gen * 3.0) - 0.5) * 3.14159 * (0.6 + 0.8 * rough) + 1.2;
            vec2 dir = vec2(cos(ang), sin(ang));
            float len = (0.4 + 0.6 * clamp(strokeP, 0.0, 1.0)) * (0.6 + 0.4 * hash21(id + 5.0)) * smoothstep(0.0, 0.15, life);
            vec2 a = c - dir * len * 0.5, b = c + dir * len * 0.5;
            // A slight curve.
            vec2 d = g - c;
            float bend = 0.15 * (hash21(id + 9.0) - 0.5) * dot(d, dir) * dot(d, dir);
            vec2 gg = g - vec2(-dir.y, dir.x) * bend;
            float dist = sdSeg(gg, a, b);
            float w = 0.14 * (0.8 + 0.4 * hash21(id + 7.0));
            // Dry brush texture along the stroke.
            float bristle = noise2(vec2(dot(d, dir) * 4.0, dot(d, vec2(-dir.y, dir.x)) * 40.0) + id);
            float on = smoothstep(w, w * 0.6, dist) * (0.75 + 0.25 * bristle) * smoothstep(1.0, 0.75, life);
            vec3 pc = imgPalette(fract(h * 1.3 + gen * 0.07 + hueP * 0.159));
            pc = pc / max(max(pc.r, max(pc.g, pc.b)), 0.2);
            vec3 tint = mix(mix(vec3(0.1, 0.35, 0.75), vec3(0.2, 0.6, 0.35), step(0.5, fract(h * 3.0))), mix(vec3(0.98, 0.75, 0.1), vec3(0.95, 0.4, 0.1), step(0.5, fract(h * 3.0))), mode);
            vec3 sc = mix(tint, glowColour(pc, id, hueP * 0.159), clamp(photoP, 0.0, 1.0) * 0.6);
            col = mix(col, sc * (1.0 + 0.3 * kick), on * 0.9);
        }
    }
    finish(col);
}
