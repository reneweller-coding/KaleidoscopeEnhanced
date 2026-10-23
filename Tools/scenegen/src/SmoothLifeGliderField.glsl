//@doc
 * @brief SMOOTH LIFE GLIDER FIELD: SmoothLife: the game of life in continuous form, with gliders that wander softly over the field; the photo colours the gliders and shows in the cells between them.  Every cell gathers the field in an inner disc and in a ring around it, and the thresholds of birth and death are
 * soft curves; the field moves a little at every step.  The field is a torus.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the thresholds of birth and death (more swell, more life)
 *   audioRolloff -> the softness of the thresholds
 *
 * Knobs: scaleP (cell size), hueP.
//@params scaleP
//@audio audioSwell audioRolloff
//@state 256 144 20 32
//@body
/**  The photo at a field cell (the photo fitted to the field's height, 0.8 of it).
 *
 * @param c  The colour. (in)
 * @param lod  The lod. (in)
 *
 * @return
 *   The photo's colour.
 **/
vec3 phAt(vec2 c, float lod) { return imgLod((c - 0.5 * stateRes) / stateRes.y * 0.8 + 0.5, lod); }
/**  A logistic step at a with the width al.
 *
 * @param x  The argument. (in)
 * @param a  The first argument. (in)
 * @param al  The width of the step. (in)
 *
 * @return
 *   The step value.
 **/
float sg1(float x, float a, float al) { return 1.0 / (1.0 + exp(-(x - a) * 4.0 / al)); }
/**  A window between two logistic steps (birth and death thresholds).
 *
 * @param x  The argument. (in)
 * @param a  The first argument. (in)
 * @param b  The second argument. (in)
 * @param al  The width of the steps. (in)
 *
 * @return
 *   The window value.
 **/
float sg2(float x, float a, float b, float al) { return sg1(x, a, al) * (1.0 - sg1(x, b, al)); }
/**  A blend of two thresholds by a logistic step of the inner mean.
 *
 * @param x  The argument. (in)
 * @param y  The y. (in)
 * @param m  The parameter m. (in)
 * @param alm  The width of the step. (in)
 *
 * @return
 *   The blended threshold.
 **/
float sgm(float x, float y, float m, float alm) { float k = sg1(m, 0.5, alm); return x * (1.0 - k) + y * k; }
/**  The state pass: the next state of this cell from the last one (the rule of the scene).
 *
 *
 * @return
 *   The cell's new state.
 **/
vec4 stateStep()
{
    ivec2 ip = stCell();
    if (stateFrame < 0.5) {
        float n = noise2(vec2(ip) / 9.0);
        float n2 = noise2(vec2(ip) / 5.0 + 31.0);
        return vec4(smoothstep(0.55, 0.65, n) * smoothstep(0.35, 0.5, n2), 0.0, 0.0, 1.0);
    }
    float ri = 3.0;
    float ra = 9.0;
    float sI = 0.0, sO = 0.0, nI = 0.0, nO = 0.0;
    for (int dy = -9; dy <= 9; ++dy)
        for (int dx = -9; dx <= 9; ++dx) {
            float d = length(vec2(float(dx), float(dy)));
            float wi = clamp(ri + 0.5 - d, 0.0, 1.0);
            float wo = clamp(ra + 0.5 - d, 0.0, 1.0) - wi;
            if (wi + wo <= 0.0) continue;
            float f = stAt(ip + ivec2(dx, dy)).r;
            sI += f * wi; nI += wi;
            sO += f * wo; nO += wo;
        }
    float m = sI / nI;
    float n = sO / nO;
    float sw = clamp(audioSwell, 0.0, 1.0);
    float an = 0.028 + 0.03 * clamp(audioRolloff, 0.0, 1.0);
    float wob = 0.014 * sin(0.17 * sceneTime) + 0.008 * sin(0.41 * sceneTime + 1.0);
    float b1 = 0.278 - 0.01 * sw + wob;
    float b2 = 0.365 + 0.5 * wob;
    float d1 = 0.267 - 0.01 * sw + wob;
    float d2 = 0.445 + 0.5 * wob;
    float s = sg2(n, sgm(b1, d1, m, 0.147), sgm(b2, d2, m, 0.147), an);
    float f0 = stAt(ip).r;
    float f1 = clamp(f0 + 0.18 * (2.0 * s - 1.0), 0.0, 1.0);
    return vec4(f1, mix(stAt(ip).g, f1, 0.1), 0.0, 1.0);
}
void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float zoom = 1.0 - 0.45 * clamp(scaleP, 0.0, 1.0);
    vec2 cc = stView(p, zoom);
    vec4 s = stLin(cc);
    vec3 ph = phAt(cc, 0.8);
    vec3 col = ph * (0.1 + 1.25 * s.r) + imgPalette(0.3 + 0.5 * s.g) * (s.r * (1.0 - s.r)) * 1.2;
    finish(col);
}
