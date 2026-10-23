//@doc
 * @brief CORNSWEET PLATEAUS: Cornsweet edges: the photo cut into flat plateaus of tone, and at every edge between them a ramp that darkens on one side and lightens on the other; the eye reads the plateaus as lighter and darker than
 * they are -- the plateaus themselves are in fact flat.  The edge ramps are made by lifting the difference to the local mean (a difference of tones, Cornsweet's profile); the colours are the photo's.  The ramps' strength follows
 * the swell of the music, the plateaus drift slowly across the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the strength of the edge ramps
 *   audioAdvance    -> the plateaus drift (integrated)
 *
 * Knobs: levelP (how many tone plateaus), hueP.
//@params levelP
//@audio audioSwell
//@body
/**  The photo cut into plateaus of tone (its colour kept).
 *
 * @param uv  The place in the photo. (in)
 * @param L   The number of tone levels. (in)
 *
 * @return
 *   The plateau colour.
 **/
vec3 plateau(vec2 uv, float L)
{
    vec3 c = imgLod(uv, 1.5);
    float l = max(luma(c), 0.04);
    return c * (floor(l * L + 0.5) / L / l);
}
void main()
{
    vec2 p = screenP();
    float L = 3.0 + 4.0 * clamp(levelP, 0.0, 1.0);
    vec2 uv = (p + 0.04 * vec2(sin(0.03 * audioAdvance), cos(0.025 * audioAdvance))) * 0.8 + 0.5;
    vec3 q0 = plateau(uv, L);
    vec3 m = q0;
    float rho = 0.028;
    for (int i = 0; i < 8; ++i) {
        float a = 0.785398 * float(i);
        m += plateau(uv + rho * vec2(cos(a), sin(a)), L);
    }
    m /= 9.0;
    float k = 1.4 + 2.2 * clamp(audioSwell, 0.0, 1.0);
    finish(max(q0 + k * (q0 - m), 0.0) * 1.05);
}
