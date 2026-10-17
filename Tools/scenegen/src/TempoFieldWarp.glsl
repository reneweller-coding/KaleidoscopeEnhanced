//@doc
 * @brief TEMPO FIELD WARP: the picture as a timeline that the beat bends -- time runs across the frame from right to
 * left, every beat a seam that travels with it, and at each seam the photo is squeezed in just before and stretched
 * just after, like a tape pulled taut at each count.  The frame is stacked in bands that keep different counts --
 * beats, half beats, bars -- so the seams of the bands slide past each other in a polyrhythm of folds.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBeatPhase  -> the seams travel one spacing per beat (the beats counted on the state pass: continuous)
 *   audioSwell      -> how deeply each seam bends the picture
 *   audioKick       -> the seams flash (light)
 *
 * Knobs: spacingP (the seams' spacing), bandsP (how many bands), photoP (photo share), hueP.
//@params spacingP bandsP photoP
//@audio audioBeatPhase audioSwell audioKick
//@state 1 1 120
//@body
/**  The state pass: counts the beats (wraps of the beat phase).
 *
 * @return
 *   The beats (r), the last beat phase (g), 0, 1.
 **/
vec4 stateStep()
{
    if (stateFrame < 0.5) return vec4(0.0, audioBeatPhase, 0.0, 1.0);
    vec4 c = texelFetch(texState, ivec2(0, 0), 0);
    return vec4(c.r + (audioBeatPhase < c.g - 0.5 ? 1.0 : 0.0), audioBeatPhase, 0.0, 1.0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float beats = texelFetch(texState, ivec2(0, 0), 0).r + clamp(audioBeatPhase, 0.0, 1.0);
    float nb = floor(2.0 + 3.0 * clamp(bandsP, 0.0, 1.0));
    float band = floor((p.y + 0.5) * nb);
    float yb = fract((p.y + 0.5) * nb);
    float mult = band == 0.0 ? 1.0 : (mod(band, 3.0) == 1.0 ? 2.0 : (mod(band, 3.0) == 2.0 ? 0.25 : 0.5));   // beats, halves, bars
    float w = (0.18 + 0.2 * clamp(spacingP, 0.0, 1.0)) / mult;
    float depth = (0.45 + 0.6 * clamp(audioSwell, 0.0, 1.0)) * w;
    // the seams: at x_n = (n - beats * mult) * w, travelling left
    float x = p.x + beats * mult * w;
    float n0 = floor(x / w + 0.5);
    float disp = 0.0, glow = 0.0;
    for (int k = -1; k <= 1; ++k) {
        float xs = (n0 + float(k)) * w;
        float d = x - xs;
        float sig = 0.22 * w;
        disp += depth * d / sig * exp(-d * d / (sig * sig)) * 0.6;
        glow += exp(-d * d / (sig * sig * 0.05));
    }
    float soft = smoothstep(0.0, 0.08, yb) * smoothstep(1.0, 0.92, yb);   // the bands' seams in y blend
    vec2 uv = vec2(p.x - disp * soft, p.y) * 0.55 + 0.5 + vec2(0.01 * sceneTime, 0.0);
    vec3 col = imgLod(uv, 0.3);
    vec3 tone = imgPalette(0.2 + 0.15 * band + 0.03 * audioPhase);
    col = mix(col * tone * 1.6, col, 0.6 + 0.4 * clamp(photoP, 0.0, 1.0));
    col += mix(tone, vec3(1.0), 0.5) * glow * soft * 0.12 * (0.4 + clamp(audioKick, 0.0, 1.0));
    col *= 0.85 + 0.15 * soft;
    finish(col * 1.05);
}
