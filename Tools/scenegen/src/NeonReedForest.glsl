//@doc
 * @brief NEON REED FOREST: a slow flight through a forest of hundreds of neon tubes standing in fog like reeds --
 * leaning every way, without an up or a down -- each tube one pitch class, glowing as its note sounds.  The tubes sit
 * one in every cell of a turned lattice, each with its own place and direction; the ray walks through the cells it
 * crosses and gathers every tube's glow by the closest distance between the ray and the tube's segment, with a bright
 * core and a soft halo, dimmed by the fog with depth.  Each pitch class's strength is smoothed in a small field of the
 * scene's own.  The tubes are shades of one colour family from the photo, a shade for every pitch class.
 *
 * Audio Reactivity (structure, not only light):
 *   audioChroma[12] -> every tube glows with its pitch class (smoothed)
 *   audioAdvance    -> the flight through the forest (integrated)
 *   audioSwell      -> the fog's glow
 *
 * Knobs: lengthP (the tubes' length), fogP (how thick the fog is), hueP.
//@params lengthP fogP
//@audio audioChroma[12] audioSwell
//@state 12 1 60
//@body
/**  The state pass: each pitch class's strength smoothed.
 *
 * @return
 *   This pitch class's smoothed strength, 0, 0, 1.
 **/
vec4 stateStep()
{
    int k = stCell().x;
    float c = clamp(audioChroma[k], 0.0, 1.0);
    float old = stateFrame < 0.5 ? c : texelFetch(texState, ivec2(k, 0), 0).r;
    return vec4(mix(old, c, 0.05), 0.0, 0.0, 1.0);
}

/**  A hash of a cell (three values 0..1; Hoskins' hash without sine).
 *
 * @param p  The cell. (in)
 *
 * @return
 *   Three pseudo-random numbers.
 **/
vec3 reedHash(vec3 p)
{
    p = fract(p * vec3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yxz + 33.33);
    return fract((p.xxy + p.yxx) * p.zyx);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float fh = famHue();
    float fly = 0.25 * sceneTime + 0.9 * audioAdvance;
    float L = 0.35 + 0.3 * clamp(lengthP, 0.0, 1.0);                  // a tube's half length (cells)
    float fog = 0.12 + 0.12 * clamp(fogP, 0.0, 1.0);
    mat3 turnM = mat3(0.8, 0.36, -0.48, -0.6, 0.48, -0.64, 0.0, 0.8, 0.6);   // the lattice turned against the flight
    vec3 ro = turnM * vec3(0.3, 0.2, fly);
    vec3 rd = turnM * normalize(vec3(p, 1.0));
    vec3 col = vec3(0.0);
    vec3 last = vec3(-999.0);
    for (int s = 0; s < 48; ++s) {
        float t = 0.2 + float(s) * 0.3;
        vec3 x = ro + rd * t;
        vec3 cell = floor(x);
        if (cell == last) continue;                                   // each cell's tube once
        last = cell;
        for (int nb = 0; nb < 2; ++nb) {
            vec3 cc = cell + (nb == 0 ? vec3(0.0) : sign(rd) * vec3(0.0, 0.0, 1.0));
            vec3 h = reedHash(cc);
            vec3 a = cc + 0.2 + 0.6 * h;
            vec3 u = normalize(reedHash(cc + 7.0) - 0.5);
            // the closest approach between the ray and the tube's segment
            vec3 w0 = ro - a;
            float b = dot(rd, u), d0 = dot(rd, w0), e0 = dot(u, w0);
            float den = max(1.0 - b * b, 1e-4);
            float sc = clamp((e0 - b * d0) / den, -L, L);
            float tc = max(dot(a + u * sc - ro, rd), 0.0);
            float dist = length(ro + rd * tc - (a + u * sc));
            int pc = int(mod(cc.x * 7.0 + cc.y * 3.0 + cc.z * 5.0, 12.0));
            float chroma = texelFetch(texState, ivec2(pc, 0), 0).r;
            float lit = 0.25 + 1.4 * chroma * chroma;
            float core = exp(-pow(dist / 0.012, 2.0)) * 1.4 + exp(-dist / 0.06) * 0.25;
            col += famLight(fh, 0.15 + 0.7 * float(pc) / 11.0, 0.45) * core * lit * exp(-fog * tc) / (0.5 + 0.2 * tc);
        }
    }
    col += famCol(fh, 0.45) * (0.03 + 0.05 * clamp(audioSwell, 0.0, 1.0));
    finish(famExpose(col, 2.40, 1.00, 0.03, fh));
}
