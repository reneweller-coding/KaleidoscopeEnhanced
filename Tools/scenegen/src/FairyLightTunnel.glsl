//@doc
 * @brief FAIRY LIGHT TUNNEL: strings of fairy lights wind in spirals round the flight path, bulb after bulb into the
 * distance, and chasing lights run along them in time with the beats.  Every string is a helix at the tunnel's radius;
 * a place on the screen looks at the depth where the helices show there, and the bulbs nearest along each string are
 * tried -- each a round glow on its fine wire.  The chase is a wave along every string, moved on by the beats counted in
 * a small field of the scene's own.  The bulbs are shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBeatPhase -> chasing lights run along the strings (beats counted)
 *   audioAdvance   -> the flight (integrated)
 *   audioSwell     -> the bulbs' glow
 *
 * Knobs: stringP (how many strings), bulbP (the bulbs' spacing), hueP.
//@params stringP bulbP
//@audio audioBeatPhase audioSwell
//@state 1 1 60 32
//@body
/**  The state pass: the beats counted by summing the beat phase's steps.
 *
 * @return
 *   x the beats so far, y the last beat phase, 0, 1.
 **/
vec4 stateStep()
{
    float bp = clamp(audioBeatPhase, 0.0, 1.0);
    if (stateFrame < 0.5) return vec4(0.0, bp, 0.0, 1.0);
    vec4 old = texelFetch(texState, ivec2(0, 0), 0);
    float d = fract(bp - old.y + 1.0);
    if (d > 0.5) d = 0.0;
    return vec4(mod(old.x + d, 4096.0), bp, 0.0, 1.0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float fh = famHue();
    const float RH = 0.55, F = 1.0, TW = 0.9;
    float r = max(length(p), 1e-3), a = atan(p.y, p.x);
    float fly = 0.3 * sceneTime + 1.0 * audioAdvance;
    vec4 st = texelFetch(texState, ivec2(0, 0), 0);
    float dl = fract(clamp(audioBeatPhase, 0.0, 1.0) - st.y + 1.0);
    float beats = st.x + (dl < 0.5 ? dl : 0.0);                       // the count carried on to this frame
    float NS = floor(5.0 + 3.0 * clamp(stringP, 0.0, 1.0));
    float dB = 0.18 + 0.12 * clamp(bulbP, 0.0, 1.0);                  // the bulbs' spacing along the flight
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec3 col = famCol(fh, 0.4) * 0.02;
    float z = RH * F / r;                                             // the depth where the strings show here
    for (int c = 0; c < 8; ++c) {
        float fc = float(c);
        if (fc >= NS) break;
        float off = fc * 6.2831853 / NS;
        // the wire: the string's angle at this depth
        float phiW = off + TW * (z + fly);
        float dw = abs(mod(a - phiW + 3.14159265, 6.2831853) - 3.14159265) * r;
        col += famCol(fh, 0.5) * exp(-pow(dw / (1.5 / resolution.y + 0.002 / z), 2.0)) * 0.12 * exp(-0.08 * z);
        // the bulbs nearest along the string
        float n0 = floor((z + fly) / dB + 0.5);
        for (int j = -2; j <= 2; ++j) {
            float n = n0 + float(j);
            float zw = n * dB, zv = zw - fly;
            if (zv < 0.08) continue;
            float phi = off + TW * zw;
            vec2 bp = RH * vec2(cos(phi), sin(phi)) / zv * F;
            float d = length(p - bp);
            float rb = 0.026 / zv;
            float chase = pow(0.5 + 0.5 * cos(6.2831853 * (n / 8.0 - beats / 2.0 + 0.25 * fc)), 4.0);
            float b = 0.2 + 0.8 * chase;
            vec3 bc = famLight(fh, 0.2 + 0.6 * fract(n * 0.381966 + fc * 0.27), 0.6);
            float fade = exp(-0.07 * zv) * smoothstep(0.08, 0.4, zv);
            col += bc * b * (exp(-pow(d / rb, 2.0)) * 1.5 + 0.25 * exp(-d / (3.0 * rb))) * fade * glow;
        }
    }
    col += famLight(fh, 0.5, 0.6) * exp(-r * 6.0) * 0.2 * glow + famCol(fh, 0.45) * 0.05 * glow;
    finish(famExpose(col, 1.85, 0.90, 0.00, fh));
}
