//@doc
 * @brief GEISSLER TUBE SPIRALS: a cabinet of Geissler tubes -- glass tubes wound into coils, their gases glowing -- turning
 * slowly, each tube lighting with its own band of the music.  A tube is a helix standing in the cabinet, seen in
 * perspective as it turns; its glow is a bright gas core inside a faint glass wall, brighter on the near side of each
 * turn.  The tubes' brightness follows five bands of the spectrum, smoothed over a second or so in a small field of the
 * scene's own.  Distinct from NeonTubes, a ray-marched room of rings.  The gases glow in two or three shades of the
 * photo's colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpectrum[32] -> each tube glows with its own band (smoothed)
 *   audioAdvance      -> the cabinet turns (integrated)
 *
 * Knobs: tubeP (how many tubes), coilP (how many turns a coil has), hueP.
//@params tubeP coilP
//@audio audioSpectrum[32]
//@state 8 1 60
//@body
/**  The state pass: five bands of the spectrum, each smoothed over a second or so.
 *
 * @return
 *   This cell's smoothed band, 0, 0, 1.
 **/
vec4 stateStep()
{
    int k = stCell().x;
    float b = 0.0;
    for (int i = 0; i < 4; ++i) b += audioSpectrum[min(2 + 5 * k + i, 31)];
    b = clamp(b * 0.25, 0.0, 1.0);
    float old = stateFrame < 0.5 ? b : texelFetch(texState, ivec2(k, 0), 0).r;
    return vec4(mix(old, b, 0.04), 0.0, 0.0, 1.0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float fh = famHue();
    float N = floor(4.0 + 1.0 * clamp(tubeP, 0.0, 1.0) + 0.5);
    float turns = 4.0 + 3.0 * clamp(coilP, 0.0, 1.0);
    float rot = 0.05 * sceneTime + 0.2 * audioAdvance;
    vec3 col = famCol(fh, 0.45) * 0.015;
    for (int i = 0; i < 5; ++i) {
        float fi = float(i);
        if (fi >= N) break;
        float band = texelFetch(texState, ivec2(i, 0), 0).r;
        float cx = 1.5 * ((fi + 0.5) / N - 0.5);
        float R = 0.11 + 0.03 * mod(fi, 2.0);
        vec3 gas = famLight(fract(fh + 0.08 * (mod(fi, 3.0) - 1.0)), 0.5, 0.3);
        float best = 9.0, front = 0.0;
        vec2 prev = vec2(0.0);
        for (int k = 0; k <= 72; ++k) {
            float t = float(k) / 72.0;
            float a = 6.2831853 * turns * t + rot * (1.0 + 0.2 * fi) + 2.0 * fi;
            vec3 x = vec3(cx + R * cos(a), 0.7 * (t - 0.5), R * sin(a));
            float z = 1.6 + x.z;
            vec2 sp = x.xy * 1.6 / z;
            if (k > 0) {
                vec2 ab = sp - prev, ap = p - prev;
                float d = length(ap - ab * clamp(dot(ap, ab) / max(dot(ab, ab), 1e-8), 0.0, 1.0));
                if (d < best) { best = d; front = 0.5 - 0.5 * sin(a); }
            }
            prev = sp;
        }
        float core = exp(-pow(best / 0.004, 2.0)), wall = exp(-pow((best - 0.011) / 0.0018, 2.0));
        float lit = 0.12 + 1.3 * band;
        col += gas * (core * lit + 0.25 * lit * exp(-best / 0.02)) * (0.4 + 0.6 * front);
        col += vec3(0.85, 0.9, 0.95) * wall * 0.12 * (0.4 + 0.6 * front);
    }
    finish(famExpose(col, 2.67, 0.80, 0.00, fh));
}
