//@doc
 * @brief DOUBLE MIRROR WAVE: two wavy mirrors facing each other -- the
 * photograph sits between them and is reflected back and forth into an
 * endless corridor of copies, each copy bent by the waves in the glass, the
 * reflections growing fainter and bluer with every bounce, the mirror
 * seams glowing.  The waves in both mirrors roll slowly and out of step,
 * so the whole corridor ripples.  Endless (the reflections continue past
 * the frame) and mirrorable by construction.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the mirrors' angle drifts (integrated, jump-free)
 *   audioAdvance    -> the waves roll along the mirrors (integrated)
 *   audioSpread     -> wave amplitude
 *   audioRoughness  -> fine ripples on the glass
 *   audioMode       -> the tint of the far reflections: blue in minor, gold in major
 *   audioHigh       -> the seams glint (light)
 *
 * Knobs: gapP (distance between the mirrors), waveP (wave length), fadeP
 * (how fast reflections fade), hueP.
//@params gapP waveP fadeP
//@audio audioPhase audioSpread audioRoughness audioMode audioHigh
//@body
void main()
{
    vec2 p = screenP();
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float ang = 0.15 * sin(0.02 * sceneTime) + 0.2 * audioPhase * 0.2;
    p = rot2(ang) * p;
    float gap = 0.18 + 0.2 * clamp(gapP, 0.0, 1.0);
    float amp = 0.02 + 0.05 * clamp(audioSpread, 0.0, 1.0);
    float wl = 4.0 + 8.0 * clamp(waveP, 0.0, 1.0);
    float flow = 0.3 * sceneTime + 2.0 * audioAdvance;
    float rough = clamp(audioRoughness, 0.0, 1.0);
    // Unfold the reflections: walk the point back into the strip between the
    // mirrors, counting bounces; each mirror's surface is wavy.
    float y = p.y;
    float x = p.x;
    float bounces = 0.0;
    float seamD = 9.0;
    for (int i = 0; i < 8; ++i) {
        float top = gap + amp * sin(x * wl + flow) + 0.006 * rough * sin(x * 60.0 + flow * 3.0);
        float bot = -gap + amp * sin(x * wl * 1.3 - flow * 0.8 + 1.0) + 0.006 * rough * sin(x * 55.0 - flow * 2.7);
        seamD = min(seamD, min(abs(y - top), abs(y - bot)));
        if (y > top) { y = 2.0 * top - y; bounces += 1.0; }
        else if (y < bot) { y = 2.0 * bot - y; bounces += 1.0; }
        else break;
    }
    vec2 uv = vec2(x * 0.5 + 0.5 + 0.01 * sceneTime, y * 0.5 / gap * 0.35 + 0.5);
    vec3 col = imgLod(uv, 0.5 + bounces * 0.4);
    float m = luma(imgLod(uv, 8.0));
    col = (col - m) * 1.4 + m;
    col *= mix(vec3(1.0), glowColour(imgLod(uv, 5.0), vec2(x, bounces * 0.3), hueP * 0.159) * 1.4, 0.4);
    // Each bounce loses light and takes on the mirror's tint.
    vec3 tint = mix(vec3(0.6, 0.8, 1.1), vec3(1.1, 0.9, 0.6), clamp(audioMode, 0.0, 1.0));
    float fade = 0.78 - 0.15 * clamp(fadeP, 0.0, 1.0);
    col *= pow(fade, bounces) * mix(vec3(1.0), tint, min(bounces * 0.25, 1.0));
    // The mirror seams glow faintly.
    col += tint * exp(-seamD / (2.0 / resolution.y * 2.5)) * (0.1 + 0.5 * hi);
    finish(col * 1.1);
}
