//@doc
 * @brief TEXTURE TIDAL EXCHANGE: two photos meet as two liquids, one above the other across a slanting tide line, and
 * their boundary breaks into fingers that reach into each other -- long tongues and fine fringes, curling at their tips
 * -- growing longer as the music swells and drawing back as it calms.  The boundary is a slow wave plus fingers: sharp
 * crests of sines along it, with finer fingers on them and a curl of noise near the line; their length is the swell,
 * smoothed in a small field of the scene's own.  Above the line lies the photo, below it the photo before it (the second
 * photo), both calmed toward one colour family; the boundary itself glows.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the fingers grow and draw back (smoothed)
 *   audioAdvance -> the fingers drift along the boundary (integrated)
 *
 * Knobs: fingerP (how many fingers), curlP (how much their tips curl), hueP.
//@params fingerP curlP
//@audio audioSwell
//@state 1 1 60
//@body
/**  The state pass: the swell smoothed.
 *
 * @return
 *   x the smoothed swell, 0, 0, 1.
 **/
vec4 stateStep()
{
    float s = clamp(audioSwell, 0.0, 1.0);
    float old = stateFrame < 0.5 ? s : texelFetch(texState, ivec2(0, 0), 0).r;
    return vec4(mix(old, s, 0.03), 0.0, 0.0, 1.0);
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
    float sw = texelFetch(texState, ivec2(0, 0), 0).r;
    float drift = 0.04 * sceneTime + 0.2 * audioAdvance;
    vec2 q = rot2(0.35) * p;                                          // a slanting tide line
    float k = 4.0 + 5.0 * clamp(fingerP, 0.0, 1.0);
    float curl = 0.03 + 0.07 * clamp(curlP, 0.0, 1.0);
    // a curl of noise near the line bends the fingers' tips
    vec2 w = q + curl * vec2(fbm(q * 4.0 + vec2(drift, 0.0)) - 0.5, fbm(q * 4.0 + vec2(3.3, drift)) - 0.5) * 2.0;
    float len = 0.06 + 0.22 * sw;
    float s1 = sin(k * w.x * 3.14159265 + drift * 3.0), s2 = sin(2.7 * k * w.x * 3.14159265 - drift * 4.0 + 1.3);
    float fingers = len * (sign(s1) * pow(abs(s1), 3.0) + 0.35 * sign(s2) * pow(abs(s2), 3.0));
    float line = 0.06 * sin(1.3 * w.x + 0.5 * drift) + fingers;
    float d = w.y - line;
    float px = 1.5 / resolution.y;
    vec2 uv = vec2(0.5) + p * vec2(0.55, 0.95);
    vec3 a = tone(imgLod(uv, 1.0), fh), b = tone(imgB(uv, 1.0), fh);
    vec3 col = mix(b, a, smoothstep(-px, px, d));
    col += famLight(fh, 0.6, 0.6) * (exp(-pow(d / 0.006, 2.0)) * 0.5 + exp(-abs(d) / 0.04) * 0.12);
    finish(col);
}
