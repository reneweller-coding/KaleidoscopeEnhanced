//@doc
 * @brief ROOM MODE GLOW: floating inside standing sound waves: the pressure antinodes of a room's modes fill space as a
 * lattice of glowing spheres without walls, and the pattern is the music's: each pitch class excites its own mode, so
 * the strongest notes decide which lattices of spheres shine.  A mode's antinodes are where |cos(n_x pi x / L)
 * cos(n_y pi y / L) cos(n_z pi z / L)| comes close to 1, each mode with its own three numbers; every mode shines by its
 * pitch class's strength squared over the strongest one's (smoothed over a second or so in a small field of the
 * scene's own), so the lattices of a chord overlap instead of cancelling.  The ray gathers the spheres' light in
 * dithered steps.  The view drifts and turns slowly.  The light is shades of one colour family from the photo, a shade
 * for every mode.
 *
 * Audio Reactivity (structure, not only light):
 *   audioChroma[12] -> the strongest pitch classes excite their modes: the lattice changes with the notes (smoothed)
 *   audioAdvance    -> the view drifts through the room (integrated)
 *   audioSwell      -> the antinodes' glow
 *
 * Knobs: roomP (the room's size), sharpP (how sharp the antinodes are), hueP.
//@params roomP sharpP
//@audio audioChroma[12] audioSwell
//@state 12 1 60
//@body
/**  The state pass: each pitch class's strength smoothed over a second or so.
 *
 * @return
 *   This pitch class's smoothed strength, 0, 0, 1.
 **/
vec4 stateStep()
{
    int k = stCell().x;
    float c = clamp(audioChroma[k], 0.0, 1.0);
    float old = stateFrame < 0.5 ? c : texelFetch(texState, ivec2(k, 0), 0).r;
    return vec4(mix(old, c, 0.03), 0.0, 0.0, 1.0);
}

/**  A pitch class's room mode: its three mode numbers.
 *
 * @param k  The pitch class. (in)
 *
 * @return
 *   n_x, n_y, n_z.
 **/
vec3 modeOf(int k)
{
    if (k == 0) return vec3(1.0, 2.0, 3.0);
    if (k == 1) return vec3(2.0, 1.0, 3.0);
    if (k == 2) return vec3(3.0, 2.0, 1.0);
    if (k == 3) return vec3(1.0, 3.0, 2.0);
    if (k == 4) return vec3(2.0, 3.0, 1.0);
    if (k == 5) return vec3(3.0, 1.0, 2.0);
    if (k == 6) return vec3(2.0, 2.0, 3.0);
    if (k == 7) return vec3(3.0, 3.0, 1.0);
    if (k == 8) return vec3(1.0, 1.0, 3.0);
    if (k == 9) return vec3(4.0, 2.0, 1.0);
    if (k == 10) return vec3(2.0, 4.0, 1.0);
    return vec3(1.0, 2.0, 4.0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float fh = famHue();
    float L = 1.0 + 0.4 * clamp(roomP, 0.0, 1.0);
    float sharp = 12.0 + 12.0 * clamp(sharpP, 0.0, 1.0);
    float run = 0.03 * sceneTime + 0.12 * audioAdvance;
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec3 w[12];
    float a[12];
    float amax = 0.05;                                                // silence stays dim
    for (int k = 0; k < 12; ++k) {
        float c = texelFetch(texState, ivec2(k, 0), 0).r;
        a[k] = c * c;
        amax = max(amax, a[k]);
        w[k] = modeOf(k) * 3.14159265 / L;
    }
    vec3 ro = vec3(0.3 * sin(0.5 * run), 0.2 * cos(0.4 * run), run * 0.8);
    vec3 rd = normalize(vec3(p, 1.2));
    rd.xz = rot2(0.2 * sin(0.3 * run)) * rd.xz;
    vec3 col = vec3(0.0);
    float t = 0.05 + 0.02 * hash21(gl_FragCoord.xy);
    for (int i = 0; i < 100; ++i) {
        vec3 x = ro + rd * t;
        float fade = exp(-0.8 * t);
        for (int k = 0; k < 12; ++k) {
            float s = a[k] / amax;
            if (s < 0.02) continue;
            vec3 cc = cos(w[k] * x);
            col += famLight(fh, 0.2 + 0.6 * float(k) / 11.0, 0.4) * s * pow(abs(cc.x * cc.y * cc.z), sharp) * fade * 0.15;
        }
        t += 0.02;
    }
    col = col * glow + famCol(fh, 0.45) * 0.015;
    finish(col);
}
