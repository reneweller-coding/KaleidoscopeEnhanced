//@doc
 * @brief SCRIABIN COLOUR ORGAN: Scriabin's colour keyboard as large, soft fields of colour: the sounding key and the
 * chord's notes give the colours after his mapping of keys to colours -- C red, G orange, D yellow, A green, E sky
 * blue, B blue, F sharp violet blue and so on -- one main colour in wide calm fields at any moment, a second sliding in
 * at their edges, the fields pushing into one another as the chords change; the photo gives the fields their texture.
 * The pitch classes' strengths are smoothed over a second or so in a small field of the scene's own; the main colour
 * is a soft maximum over them (strengths to the fourth power), the second a broader blend, so a change of chord glides
 * from colour to colour and never shows all colours at once.
 *
 * Audio Reactivity (structure, not only light):
 *   audioChroma[12] -> the colours: the strongest pitch classes, after Scriabin's key colours (smoothed)
 *   audioAdvance    -> the fields drift and push into one another (integrated)
 *
 * Knobs: fieldP (the fields' size), textureP (how much of the photo's texture shows).
//@params fieldP textureP
//@audio audioChroma[12]
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

/**  Scriabin's colour for a pitch class.
 *
 * @param k  The pitch class, 0 = C .. 11 = B. (in)
 *
 * @return
 *   The colour.
 **/
vec3 scriabin(int k)
{
    if (k == 0) return vec3(1.0, 0.08, 0.05);
    if (k == 1) return vec3(0.55, 0.2, 0.9);
    if (k == 2) return vec3(1.0, 0.92, 0.2);
    if (k == 3) return vec3(0.55, 0.6, 0.72);
    if (k == 4) return vec3(0.6, 0.82, 1.0);
    if (k == 5) return vec3(0.6, 0.05, 0.12);
    if (k == 6) return vec3(0.3, 0.38, 1.0);
    if (k == 7) return vec3(1.0, 0.55, 0.2);
    if (k == 8) return vec3(0.6, 0.3, 0.85);
    if (k == 9) return vec3(0.2, 0.8, 0.35);
    if (k == 10) return vec3(0.6, 0.62, 0.7);
    return vec3(0.35, 0.5, 1.0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float sc = 0.8 + 0.8 * clamp(fieldP, 0.0, 1.0);
    float tex = 0.3 + 0.5 * clamp(textureP, 0.0, 1.0);
    float run = 0.02 * sceneTime + 0.08 * audioAdvance;
    vec3 mainC = vec3(0.0), secC = vec3(0.0);
    float wm = 0.0, ws = 0.0;
    for (int k = 0; k < 12; ++k) {
        float c = texelFetch(texState, ivec2(k, 0), 0).r;
        float a = pow(c, 4.0) + 1e-4, b = c + 1e-4;
        mainC += a * scriabin(k);
        wm += a;
        secC += b * scriabin(k);
        ws += b;
    }
    mainC /= wm;
    secC /= ws;
    // the fields: a wide main field with the second colour pushing in at its edges
    vec2 w = p / sc + 0.4 * (vec2(fbm(p * 0.9 + vec2(run, 0.0)), fbm(p * 0.9 + vec2(4.1, -run))) - 0.5);
    float edge = smoothstep(0.42, 0.62, fbm(w * 1.3 + 0.3 * run));
    vec3 field = mix(mainC, secC, edge * 0.7);
    float photo = luma(imgLod(p * 0.5 + 0.5, 3.0));
    vec3 col = field * (1.0 - tex + tex * (0.4 + 1.2 * photo)) * 0.75;
    finish(col);
}
