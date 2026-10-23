//@doc
 * @brief CHROMA LUMA DUET: the brightness of the first photo carries the colours of the second, and the other way round, in diagonal bands that wander over the picture: within a band the first photo wears the second's colours, outside
 * it the second wears the first's -- no blend, each photo keeps its own brightness and is dressed in the other's hues.  The bands wander with the phase of the music and widen with the swell.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the bands wander (integrated)
 *   audioSwell      -> the width of the bands
 *
 * Knobs: bandP (how many bands), hueP.
//@params bandP
//@audio audioSwell
//@body
/**  A colour from the brightness of one photo and the hue of another.
 *
 * @param lumaFrom  The photo giving the brightness. (in)
 * @param hueFrom   The photo giving the chroma. (in)
 *
 * @return
 *   The colour.
 **/
vec3 dress(vec3 lumaFrom, vec3 hueFrom)
{
    float y = luma(lumaFrom);
    float yb = max(luma(hueFrom), 0.05);
    vec3 ch = hueFrom / yb;
    ch = mix(vec3(1.0), ch, 0.85);
    return clamp(ch * y, 0.0, 1.5);
}
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    vec3 a = imgLod(uv, 0.7), b = imgB(uv, 0.7);
    float N = 1.5 + 2.5 * clamp(bandP, 0.0, 1.0);
    float s = dot(p, vec2(0.8, 0.6)) * N + 0.08 * audioPhase + 0.01 * sceneTime;
    float w = 0.5 + 0.2 * (clamp(audioSwell, 0.0, 1.0) - 0.5);
    float m = smoothstep(w + 0.05, w - 0.05, abs(fract(s) - 0.5) * 2.0);
    finish(mix(dress(b, a), dress(a, b), m) * 1.1);
}
