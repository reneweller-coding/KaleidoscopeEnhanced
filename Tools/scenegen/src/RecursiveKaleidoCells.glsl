//@doc
 * @brief RECURSIVE KALEIDO CELLS: a kaleidoscope whose cells are kaleidoscopes, in a smaller scale, again and again: rosettes within rosettes, an iterated fold in which every level mirrors the picture into wedges, scales it up and
 * moves it to a new heart, so that the picture is made of rosettes of rosettes down to the smallest.  The photo is on every level.  The depth follows the spectral spread (the finest rosettes, drawn by the hi-hat's band, fade in),
 * the turn of the levels the phase of the music.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread     -> the depth of the recursion (the finest level fading in)
 *   audioPhase      -> the levels turn (integrated)
 *
 * Knobs: wedgeP (the number of wedges), hueP.
//@params wedgeP
//@audio audioSpread
//@body
/**  The iterated kaleidoscope with a given number of levels.
 *
 * @param p    The pixel. (in)
 * @param dep  The number of levels. (in)
 *
 * @return
 *   The colour.
 **/
vec3 iterKaleido(vec2 p, int dep)
{
    float n = 4.0 + 2.0 * floor(3.0 * clamp(wedgeP, 0.0, 1.0));
    float w = 6.2831853 / n;
    vec2 q = p * 1.3;
    float glow = 0.0;
    for (int i = 0; i < 6; ++i) {
        if (i >= dep) break;
        float r = length(q), a = atan(q.y, q.x);
        float fa = a - floor(a / w) * w;
        float fold = abs(fa - 0.5 * w);
        q = r * vec2(cos(fold), sin(fold));
        q = q * 1.9 - vec2(0.55, 0.0);
        q = rot2(0.04 * audioPhase * (1.0 + 0.5 * float(i)) + 0.02 * sceneTime) * q;
        glow += exp(-8.0 * abs(q.y));
    }
    vec3 c = imgLod(q * 0.5 * 0.8 + 0.5, 0.8);
    return c * (0.8 + 0.08 * glow);
}
void main()
{
    vec2 p = screenP();
    float D = 2.0 + 3.0 * clamp(audioSpread, 0.0, 1.0);
    int d0 = int(floor(D));
    finish(mix(iterKaleido(p, d0), iterKaleido(p, d0 + 1), smoothstep(0.0, 1.0, fract(D))) * 1.05);
}
