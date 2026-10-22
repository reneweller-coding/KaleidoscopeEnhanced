//@doc
 * @brief IRIDESCENT GRADIENT BLOB: a large glossy blob floats in the middle of a soft gradient and shimmers between two
 * tones, holographic, as its surface turns; its outline swells and ripples with the bass.  The blob is a circle bent by
 * a few slow waves round its rim, their height the bass (smoothed in a small field of the scene's own); seen as a
 * dome, its surface faces the eye in the middle and turns away at the rim, and the shimmer is a cosine of that turn
 * and of a slow swirl, sliding between two tones of the photo's colour family instead of through the rainbow.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBass    -> the blob's outline swells and ripples (smoothed)
 *   audioAdvance -> the ripples turn round the rim (integrated)
 *   audioSwell   -> the shimmer's strength
 *
 * Knobs: sizeP (the blob's size), shimmerP (how fast the tones alternate), hueP.
//@params sizeP shimmerP
//@audio audioBass audioSwell
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

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float fh = famHue();
    float bass = texelFetch(texState, ivec2(0, 0), 0).r;
    float run = 0.1 * sceneTime + 0.4 * audioAdvance;
    float R0 = 0.3 + 0.12 * clamp(sizeP, 0.0, 1.0);
    float a = atan(p.y, p.x), r = length(p);
    float rim = R0 * (1.0 + (0.04 + 0.14 * bass) * (sin(3.0 * a + run) * 0.6 + sin(5.0 * a - 1.3 * run + 1.0) * 0.4)
                      + 0.03 * sin(2.0 * a + 0.4 * run));
    float d = r - rim;
    vec3 tA = famLight(fh, 0.3, 0.35), tB = famLight(fract(fh + 0.08), 0.8, 0.35);
    vec3 back = mix(famCol(fh, 0.3) * 0.12, famCol(fh, 0.7) * 0.22, smoothstep(-0.6, 0.6, p.x + 0.4 * p.y));
    float inside = 1.0 - smoothstep(-1.5 / resolution.y, 1.5 / resolution.y, d);
    float h = sqrt(max(1.0 - pow(r / rim, 2.0), 0.0));                 // the dome's height: facing the eye
    float k = 4.0 + 6.0 * clamp(shimmerP, 0.0, 1.0);
    float sh = 0.5 + 0.5 * cos(k * h + 3.0 * sin(a + 0.3 * run) + run);
    vec3 surf = mix(tA, tB, sh) * (0.5 + 0.5 * h) * (0.7 + 0.5 * clamp(audioSwell, 0.0, 1.0));
    surf += vec3(1.0) * pow(max(h, 0.0), 20.0) * 0.15 + famLight(fh, 0.5, 0.8) * exp(-pow((1.0 - h) / 0.05, 2.0)) * 0.3;
    vec3 col = mix(back, surf, inside) + famLight(fh, 0.5, 0.5) * exp(-max(d, 0.0) * 12.0) * 0.15 * (1.0 - inside);
    finish(col);
}
