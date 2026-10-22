//@doc
 * @brief LYCRA SLEEVE TUNNEL: inside a long stretched sleeve of fabric lit in colour from outside: the light shines
 * through the thin cloth, and waves roll through the fabric with the bass, the cloth glowing brighter where it is
 * stretched thin over a crest.  The fabric is a height field on the tunnel's wall: travelling waves with a whole number
 * of crests around, their height the bass (smoothed in a small field of the scene's own); the cloth is lit by its slope
 * against a light that circles slowly, and lets more light through where it stretches over a crest.  A faint knit
 * shows close up.  The light outside is the photo, calmed toward one colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBass    -> the waves rolling through the fabric (smoothed)
 *   audioAdvance -> the flight (integrated)
 *   audioPhase   -> the light outside circles (integrated)
 *   audioSwell   -> the light's strength
 *
 * Knobs: waveP (the waves' length), knitP (how much the knit shows), hueP.
//@params waveP knitP
//@audio audioBass audioPhase audioSwell
//@state 1 1 60
//@body
/**  The state pass: the bass smoothed.
 *
 * @return
 *   x the smoothed bass, 0, 0, 1.
 **/
vec4 stateStep()
{
    float b = clamp(audioBass, 0.0, 1.0);
    float old = stateFrame < 0.5 ? b : texelFetch(texState, ivec2(0, 0), 0).r;
    return vec4(mix(old, b, 0.05), 0.0, 0.0, 1.0);
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
    const float R0 = 0.4;
    float r = max(length(p), 1e-3), a = atan(p.y, p.x);
    float z = R0 / r;
    float fly = 0.25 * sceneTime + 0.9 * audioAdvance;
    float Y = z + fly;
    float lam = 0.6 + 0.6 * clamp(waveP, 0.0, 1.0);
    float bass = texelFetch(texState, ivec2(0, 0), 0).r;
    float amp = 0.15 + 0.85 * bass;
    float run = 0.5 * sceneTime;
    // the waves: whole numbers of crests around, rolling along
    float ph1 = 3.0 * a + 6.2831853 * Y / lam - run, ph2 = -2.0 * a + 6.2831853 * Y / (1.7 * lam) - 0.7 * run;
    float ph3 = 5.0 * a + 6.2831853 * Y / (0.6 * lam) + 0.4 * run;
    float hx = amp * (3.0 * cos(ph1) * 0.5 - 2.0 * cos(ph2) * 0.35 + 5.0 * cos(ph3) * 0.15);
    float hy = amp * 6.2831853 * (cos(ph1) * 0.5 / lam + cos(ph2) * 0.35 / (1.7 * lam) + cos(ph3) * 0.15 / (0.6 * lam));
    float hh = amp * (sin(ph1) * 0.5 + sin(ph2) * 0.35 + sin(ph3) * 0.15);
    float la = 0.03 * sceneTime + 0.3 * audioPhase;
    float slope = 0.5 + 0.25 * (hx * cos(a - la) * 0.4 + hy * 0.15);
    float stretch = 0.75 + 0.5 * hh;                                  // thinner over the crests
    vec3 light = tone(imgLod(vec2(0.5 + 0.3 * cos(a - 0.3 * la), 0.5 + 0.3 * sin(a - 0.3 * la)) + vec2(0.0, 0.0), 4.5), fh);
    float px = R0 / (r * r * resolution.y);
    float knit = 1.0 + (0.08 + 0.12 * clamp(knitP, 0.0, 1.0)) * sin(a * 160.0) * sin(Y * 220.0) * (1.0 - smoothstep(0.004, 0.012, px));
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec3 col = light * clamp(slope, 0.0, 1.2) * stretch * knit * glow * 1.5;
    col = mix(col, light * 0.4, smoothstep(5.0, 18.0, z));
    col += light * exp(-r * 8.0) * 0.4;
    finish(max(col, vec3(0.0)));
}
