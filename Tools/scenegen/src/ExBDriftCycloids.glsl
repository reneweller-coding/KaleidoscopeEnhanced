//@doc
 * @brief EXB DRIFT CYCLOIDS: charged particles in crossed electric and magnetic fields: each gyrates in small circles
 * while the crossed fields carry it sideways, so it draws a glowing cycloid -- a chain of loops -- across the dark; the
 * magnetic field follows the bass (tighter, faster loops), the electric field the harmony (faster drift).  Each
 * particle's drift and gyration are summed step by step in a small field of the scene's own, so a change of the fields
 * changes their speed and never their place; the trail is the last stretch of the path, x = x0 - v_d tau +
 * r sin(w tau), drawn as eighty segments, fading with age.  The light is shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBass        -> the magnetic field: the loops wind tighter and faster (softened by the swell)
 *   audioHarmAdvance -> the electric field: the drift speeds up and slows with the chords
 *   audioSwell       -> the trails' glow
 *
 * Knobs: rowP (how many particles), loopP (the loops' size), hueP.
//@params rowP loopP
//@audio audioBass audioHarmAdvance audioSwell
//@state 12 1 60 32
//@body
/**  The fields' gyration rate and drift speed for a particle.
 *
 * @param i  The particle. (in)
 *
 * @return
 *   x the gyration rate (radians a second), y the drift speed.
 **/
vec2 rates(float i)
{
    float hi = fract(sin(i * 12.9898) * 43758.5453);
    float B = 0.7 + 0.6 * mix(clamp(audioSwell, 0.0, 1.0), clamp(audioBass, 0.0, 1.0), 0.4);
    float E = 0.6 + 0.4 * sin(0.6 * max(audioHarmAdvance, 0.0) + 2.0 * hi);
    return vec2(3.0 * B * (0.8 + 0.4 * hi), 0.06 * E / B * (0.8 + 0.4 * hi));
}

/**  The state pass: each particle's drift (red) and gyration phase (green), summed step by step.
 *
 * @return
 *   The drift, the phase, 0, 1.
 **/
vec4 stateStep()
{
    int i = stCell().x;
    vec2 r = rates(float(i));
    vec4 old = stateFrame < 0.5 ? vec4(0.0) : texelFetch(texState, ivec2(i, 0), 0);
    // (both wrap where nothing shows: 200 x 2.5 is a whole number of spans of 4, the phase a whole number of turns)
    return vec4(mod(old.r + r.y / 60.0, 200.0), mod(old.g + r.x / 60.0, 6.2831853 * 100.0), 0.0, 1.0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float fh = famHue();
    float N = floor(8.0 + 4.0 * clamp(rowP, 0.0, 1.0));
    float rsize = 0.03 + 0.03 * clamp(loopP, 0.0, 1.0);
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec3 col = famCol(fh, 0.45) * 0.015;
    for (int i = 0; i < 12; ++i) {
        float fi = float(i);
        if (fi >= N) break;
        float hi = fract(sin(fi * 12.9898) * 43758.5453);
        vec4 st = texelFetch(texState, ivec2(i, 0), 0);
        vec2 r = rates(fi);
        float sgn = mod(fi, 2.0) < 0.5 ? 1.0 : -1.0;                   // opposite charges gyrate the other way
        float rg = rsize * (0.7 + 0.6 * hi) * 3.0 / r.x * 3.0;
        float y0 = 0.9 * ((fi + 0.5) / N - 0.5);
        // the head crosses the screen and wraps off it, after its trail (at most 1.05 long) has left
        const float SPAN = 4.0;
        float xh = -2.0 + mod(st.r * 2.5 + SPAN * hi, SPAN);
        float best = 9.0, age = 1.0;
        vec2 prev = vec2(0.0);
        for (int k = 0; k <= 80; ++k) {
            float tau = float(k) / 80.0 * 4.0;                         // seconds back
            float ph = st.g - r.x * tau;
            vec2 pt = vec2(xh - r.y * 2.5 * tau + rg * sin(ph) * sgn, y0 + rg * cos(ph));
            if (k > 0) {
                vec2 ab = pt - prev, ap = p - prev;
                float d = length(ap - ab * clamp(dot(ap, ab) / max(dot(ab, ab), 1e-8), 0.0, 1.0));
                if (d < best) { best = d; age = float(k) / 80.0; }
            }
            prev = pt;
        }
        float g = exp(-pow(best / 0.0022, 2.0)) * (1.0 - 0.85 * age) + 0.2 * exp(-best / 0.012) * (1.0 - age);
        col += famLight(fh, 0.3 + 0.4 * hi, 0.45 * (1.0 - age)) * g * glow;
    }
    finish(famExpose(col, 4.00, 0.70, 0.05, fh));
}
