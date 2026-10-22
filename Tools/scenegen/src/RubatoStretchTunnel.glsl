//@doc
 * @brief RUBATO STRETCH TUNNEL: a tunnel built of the music's beats: a glowing ring is set at the far end on every
 * beat and travels toward the eye at a steady pace, so the sections between the rings are as long as the beats were --
 * when the music hurries they crowd together, when it holds back they stretch; each section is painted with the photo,
 * stretched with it.  A small field of the scene's own keeps the moments of the last thirty-two beats, written into the
 * next slot when the beat phase wraps (at the start they hold a steady pace of half-second beats); a ring stands where its beat has travelled to by now, and a place on the wall
 * finds the rings just nearer and just farther among them.  The walls are the photo, calmed toward one colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBeatPhase -> every beat sets a ring: the sections' lengths are the beats' lengths, the tempo made space
 *   audioAdvance   -> the tunnel turns slowly (integrated)
 *   audioSwell     -> the rings' glow
 *
 * Knobs: paceP (how fast the rings travel), ringP (the rings' width), hueP.
//@params paceP ringP
//@audio audioBeatPhase audioSwell
//@state 33 1 60 32
//@body
/**  The rings' pace, the same in both passes.
 *
 * @return
 *   The pace (depth a second).
 **/
float pace()
{
    return 1.6 + 1.0 * clamp(paceP, 0.0, 1.0);
}

/**  The state pass: thirty-two beat slots and a thirty-third that remembers the last beat phase and the beats so far.
 *
 * @return
 *   A beat: its moment (s); or the bookkeeping: last beat phase, beats so far, 0, 1.
 **/
vec4 stateStep()
{
    int j = stCell().x;
    float bp = clamp(audioBeatPhase, 0.0, 1.0);
    if (stateFrame < 0.5) return j == 32 ? vec4(bp, 0.0, 0.0, 1.0) : vec4(-0.5 * float(32 - j), float(j) - 32.0, 0.0, 1.0);
    vec4 book = texelFetch(texState, ivec2(32, 0), 0);
    bool beat = bp < book.x - 0.5;
    if (j == 32) return vec4(bp, beat ? mod(book.y + 1.0, 3200.0) : book.y, 0.0, 1.0);
    if (beat && j == int(mod(book.y, 32.0))) return vec4(stateFrame / 60.0, book.y, 0.0, 1.0);
    return texelFetch(texState, ivec2(j, 0), 0);
}

/**  The photo's colour calmed toward the colour family.
 *
 * @param photo  The photo's colour. (in)
 * @param fh     The family's hue. (in)
 *
 * @return
 *   The colour.
 **/
vec3 tone(vec3 photo, float fh)
{
    float l = luma(photo);
    return mix(photo * 1.1, famCol(fh, 0.15 + 0.7 * l) * (0.25 + 1.2 * l), 0.45);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float fh = famHue();
    const float R0 = 0.4, ZF = 9.0;
    float r = max(length(p), 1e-3), a = atan(p.y, p.x) + 0.02 * sceneTime + 0.15 * audioAdvance;
    float z = R0 / r;
    float now = (stateFrame - 1.0 + stateFrac) / 60.0;                // the newest step's time carried on
    float V = pace();
    // the rings just nearer and just farther than this place
    float zN = -1.0, zFr = 1e9, nN = 0.0;
    float ringD = 9.0;
    for (int j = 0; j < 32; ++j) {
        vec4 b = texelFetch(texState, ivec2(j, 0), 0);
        float zr = ZF - V * (now - b.x);                              // where this beat's ring stands now
        if (zr < 0.0 || zr > ZF) continue;
        ringD = min(ringD, abs(z - zr));
        if (zr <= z && zr > zN) { zN = zr; nN = b.y; }
        if (zr > z && zr < zFr) zFr = zr;
    }
    float px = R0 / (r * r * resolution.y);
    vec3 col = famCol(fh, 0.4) * 0.03;
    if (zN >= 0.0 && zFr < 1e8) {
        float u = (z - zN) / max(zFr - zN, 1e-3);                     // across the section, stretched with it
        vec2 puv = vec2(0.5 + 0.32 * cos(a), 0.5 + 0.32 * sin(a)) * vec2(1.0, 0.6) + vec2(0.0, 0.4 * u);
        puv = fract(puv + vec2(0.37, 0.21) * mod(nN, 7.0));
        col = tone(imgLod(puv, 2.0), fh) * (0.35 + 0.3 * u) * exp(-0.06 * z);
    }
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float rw = (0.015 + 0.02 * clamp(ringP, 0.0, 1.0)) + 1.5 * px;
    col += famLight(fh, 0.6, 0.6) * (exp(-pow(ringD / rw, 2.0)) + 0.2 * exp(-ringD / (4.0 * rw))) * glow * exp(-0.05 * z);
    col = mix(col, famCol(fh, 0.5) * 0.3, smoothstep(10.0, ZF + 4.0, z));
    col += famLight(fh, 0.5, 0.6) * exp(-r * 9.0) * 0.3;
    finish(col);
}
