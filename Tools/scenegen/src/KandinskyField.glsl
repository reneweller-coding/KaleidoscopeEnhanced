//@doc
 * @brief KANDINSKY FIELD: a composition in the spirit of Kandinsky's
 * Bauhaus paintings, forever recomposing -- circles with halos, sharp
 * triangles, crossing straight lines, checkerboards and arcs float over a
 * softly graded ground, each element drifting and turning slowly on its
 * own, some circles pulsing their halos; colours bold and primary with
 * the photograph lending the ground its tone.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the elements drift and turn (integrated, jump-free)
 *   audioSpread     -> the elements grow
 *   audioKick       -> the circles' halos pulse (light)
 *   audioMode       -> the ground: deep blue-black in minor, warm cream in major
 *   audioHigh       -> the lines glint (light)
 *   audioSwell      -> the photo tone in the ground (slow)
 *
 * Knobs: circleP (circles), lineP (lines and triangles), checkP (checkerboards), hueP.
//@params circleP lineP checkP
//@audio audioSpread audioKick audioMode audioHigh audioSwell
//@body
vec3 kPal(float k)
{
    vec3 c[6];
    c[0] = vec3(0.9, 0.15, 0.1); c[1] = vec3(0.1, 0.25, 0.75); c[2] = vec3(0.98, 0.8, 0.1);
    c[3] = vec3(0.05, 0.05, 0.08); c[4] = vec3(0.2, 0.6, 0.35); c[5] = vec3(0.85, 0.4, 0.6);
    int i = int(mod(k, 6.0));
    vec3 r = c[0];
    for (int n = 1; n < 6; ++n) if (n == i) r = c[n];
    return r;
}

void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    vec2 uv = p * 0.5 + 0.5;
    vec3 ground = mix(vec3(0.05, 0.07, 0.15), vec3(0.93, 0.88, 0.76), mode);
    ground = mix(ground, ground * (0.7 + 0.6 * imgLod(uv, 5.0)), 0.3 + 0.4 * swell);
    ground *= 0.9 + 0.1 * smoothstep(-0.8, 0.8, p.y + 0.3 * sin(p.x));
    vec3 col = ground;
    float T = 0.03 * sceneTime + 0.25 * audioAdvance;
    float grow = 0.8 + 0.4 * clamp(audioSpread, 0.0, 1.0);
    float px = 1.5 / resolution.y;
    vec2 g = p * 1.6;
    vec2 gi = floor(g);
    for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
        vec2 id = gi + vec2(i, j);
        for (int e = 0; e < 3; ++e) {
            float fe = float(e);
            float h = hash21(id + fe * 7.1);
            vec2 c = (id + 0.5 + 0.4 * vec2(sin(T * (0.5 + h) + h * 6.28), cos(T * (0.4 + h) + h * 9.0))) / 1.6;
            float rot = T * (h - 0.5) * 2.0 + h * 6.28;
            vec2 l = rot2(rot) * (p - c);
            float kind = hash21(id + fe * 3.3 + 1.0);
            vec3 k1 = kPal(floor(hash21(id + fe) * 6.0)), k2 = kPal(floor(hash21(id + fe + 9.0) * 6.0) + 1.0);
            if (kind < 0.35 * clamp(circleP + 0.3, 0.0, 1.3)) {
                // Circle with a halo.
                float R = (0.06 + 0.08 * h) * grow;
                float r = length(l);
                col = mix(col, k2 * (0.6 + 0.4 * mode), smoothstep(R * 1.6, R * 1.2, r) * 0.5 * (0.6 + 0.8 * kick));
                col = mix(col, k1, smoothstep(R + px, R - px, r));
            } else if (kind < 0.35 + 0.3 * clamp(lineP + 0.2, 0.0, 1.2)) {
                if (h < 0.5) {
                    // Triangle.
                    float R = (0.05 + 0.07 * h) * grow;
                    vec2 q = l / R;
                    float tri = max(abs(q.x) * 0.866 + q.y * 0.5, -q.y) - 0.5;
                    col = mix(col, k1, smoothstep(px / R, -px / R, tri));
                } else {
                    // Straight line crossing far.
                    float len = (0.3 + 0.3 * h) * grow;
                    float d = sdSeg(l, vec2(-len, 0.0), vec2(len, 0.0));
                    float w = 0.003 + 0.004 * hash21(id + fe * 5.0);
                    col = mix(col, k2 * 0.6 + vec3(hi * 0.3), smoothstep(w + px, w - px, d));
                }
            } else if (kind < 0.8 + 0.2 * clamp(checkP, 0.0, 1.0)) {
                // Checkerboard patch.
                float S = (0.05 + 0.04 * h) * grow;
                vec2 q = l / S;
                if (max(abs(q.x), abs(q.y)) < 1.0) {
                    vec2 cq = floor(q * 2.0);
                    float chk = mod(cq.x + cq.y, 2.0);
                    col = mix(col, mix(k1, k2, chk), 0.95);
                }
            } else {
                // Arc.
                float R = (0.1 + 0.1 * h) * grow;
                float a = atan(l.y, l.x);
                float d = abs(length(l) - R);
                float span = step(0.0, sin(a));
                col = mix(col, k1 * 0.9, smoothstep(0.006 + px, 0.006 - px, d) * span);
            }
        }
    }
    col = mix(col, col * glowColour(imgLod(uv, 6.0), p, hueP * 0.159) * 1.3, 0.05);
    finish(col);
}
