//@doc
 * @brief TRIVISION SLATS: the photo on a row of three-sided prism strips like an old advertising hoarding: the strips turn in a
 * wave one after another, each showing three different windows of the picture on its three faces; as a strip turns its
 * present face squeezes to one side while the next widens from the other.  The wave runs across the strips.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the wave of turns (integrated)
 *   audioSpread     -> how many strips (their width), blended by the strips' fading
 *   audioSwell      -> the shading on the turning faces
 *
 * Knobs: stripsP (the base number of strips), shiftP (how different the three windows are), hueP.
//@params stripsP shiftP
//@audio audioSpread audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float t = sceneTime * 0.12 + 0.5 * audioPhase;
    float N = 14.0 + 22.0 * clamp(stripsP, 0.0, 1.0);
    float X = p.x / 1.7778 + 0.5;
    float gx = X * N;
    float i = floor(gx);
    float u = fract(gx);
    float ph = t - 0.045 * i;
    float s = fract(ph);
    float f = floor(ph);
    float xb = 1.0 - smoothstep(0.0, 1.0, s);
    float shift = 0.12 + 0.3 * clamp(shiftP, 0.0, 1.0);
    bool cur = u < xb;
    float fcur = cur ? f : f + 1.0;
    float fc = mod(fcur, 3.0);
    float uf = cur ? u / max(xb, 1e-3) : (u - xb) / max(1.0 - xb, 1e-3);
    float wid = cur ? xb : 1.0 - xb;
    vec2 win = vec2(fc * shift, 0.35 * fc * shift) - vec2(shift, 0.35 * shift);
    vec2 uv = vec2((i + uf) / N, p.y * 0.8 + 0.5) ;
    uv.x = 0.1 + 0.8 * uv.x;
    vec3 col = imgLod(uv + win, 0.4);
    col *= 0.55 + 0.45 * wid + 0.12 * clamp(audioSwell, 0.0, 1.0);
    col *= 1.0 - 0.25 * smoothstep(0.9, 1.0, u) * 0.0 - 0.18 * smoothstep(0.97, 1.0, u);
    finish(col * 1.1);
}
