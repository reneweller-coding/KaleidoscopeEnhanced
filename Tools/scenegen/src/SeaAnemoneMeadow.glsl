//@doc
 * @brief SEA ANEMONE MEADOW: a meadow of sea anemones seen from above, crowding the frame, each a ring of long
 * tentacles round a pale mouth -- and the current sweeping over them: every tentacle leans with it and waves,
 * the waves running out along it from the base to the tip, the whole meadow combed one way and then another as
 * the current turns.  The tentacles are translucent and lit at their tips; the photo colours each anemone.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the current: its sway runs along the tentacles (integrated: the music's drive)
 *   audioPhase      -> the current's direction turns (integrated)
 *   audioKick       -> the tentacle tips glow (light)
 *
 * Knobs: tentaclesP (tentacles per anemone), lengthP (their length), photoP (photo share), hueP.
//@params tentaclesP lengthP photoP
//@audio audioKick
//@body
void main()
{
    vec2 p = screenP();
    float S = 0.17;
    float nt = floor(12.0 + 10.0 * clamp(tentaclesP, 0.0, 1.0));
    float L = 0.5 + 0.25 * clamp(lengthP, 0.0, 1.0);
    float ca = 0.015 * audioPhase + 0.04 * sceneTime;
    vec2 cur = vec2(cos(ca), sin(ca));                          // the current
    float tw = 0.6 * sceneTime + 2.0 * audioAdvance;
    vec3 tone = imgPalette(0.4 + 0.03 * audioPhase);
    vec3 col = imgLod(p * 0.35 + 0.5, 4.0) * 0.2;
    vec2 cell = floor(p / S);
    float best = 0.0, bestH = -1.0;
    for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
        vec2 cc = cell + vec2(float(i), float(j));
        vec2 hh = hash22(cc);
        vec2 c = (cc + 0.5 + 0.5 * (hh - 0.5)) * S;
        vec2 d = (p - c) / S;
        float r = length(d);
        if (r > L * 1.4 + 0.1) continue;
        // bend the point back against the current: farther out, the tentacle leans and waves more
        float lean = 0.5 * r * r / L;
        float wave = 0.12 * r * sin(tw - 9.0 * r + 6.2831853 * hh.x);
        vec2 db = d - cur * (lean + wave) * 0.6;
        float rb = length(db), ang = atan(db.y, db.x) + 6.2831853 * hh.y;
        float sec = 6.2831853 / nt;
        float am = mod(ang, sec) - 0.5 * sec;
        float width = 0.06 * (1.0 - 0.7 * rb / L) + 0.01;
        float tent = (1.0 - smoothstep(width * 0.6, width, abs(am) * rb)) * (1.0 - smoothstep(L - 0.02, L, rb)) * smoothstep(0.08, 0.1, rb);
        float mouth = 1.0 - smoothstep(0.08, 0.11, r);
        float m = max(tent, mouth);
        if (m > 0.01 && hh.x > bestH) {
            bestH = hh.x;
            vec3 photo = imgLod(c * 0.5 + 0.5, 1.5);
            vec3 ca2 = mix(imgPalette(hh.y + 0.03 * audioPhase) * 1.2, photo * 1.5, 0.5 + 0.45 * clamp(photoP, 0.0, 1.0));
            float tip = smoothstep(L * 0.6, L, rb) * tent;
            vec3 c2 = ca2 * (0.45 + 0.65 * rb / L);
            c2 = mix(c2, mix(ca2, vec3(1.0), 0.5) * 0.9, mouth * 0.7);
            c2 += mix(ca2, vec3(1.0), 0.6) * tip * (0.25 + 0.6 * clamp(audioKick, 0.0, 1.0));
            col = mix(col, c2, m);
        }
    }
    finish(col * 1.1);
}
