//@doc
 * @brief HARMONIC OSCILLATOR COHERENT: quantum states of a harmonic oscillator in phase space, as Wigner functions --
 * coherent states (round blobs) and squeezed states (ellipses) orbiting the origin once a period, and cat states,
 * two blobs with a band of interference fringes between them that dips below zero.  A lattice of such phase spaces
 * fills the frame, each with its own states; the positive parts show the photo, the negative fringes its negative.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the squeezing (loud: thin ellipses)
 *   audioAdvance    -> the states orbit (integrated)
 *   audioKick       -> the fringes flash (light)
 *
 * Knobs: cellsP (phase spaces on screen), catP (the share of cat states), photoP (photo share), hueP.
//@params cellsP catP photoP
//@audio audioSwell audioKick
//@body
/**  The Wigner function of a (squeezed) coherent state centred at c, squeezed by s along the angle a.
 *
 * @param x  The phase-space point. (in)
 * @param c  The state's centre. (in)
 * @param a  The squeezing axis's angle. (in)
 * @param s  The squeezing (1: round). (in)
 *
 * @return
 *   W, 0..1.
 **/
float wigner(vec2 x, vec2 c, float a, float s)
{
    vec2 d = rot2(-a) * (x - c);
    return exp(-(d.x * d.x * s * s + d.y * d.y / (s * s)) * 2.0);
}

void main()
{
    vec2 p = screenP();
    float cells = 1.0 + floor(clamp(cellsP, 0.0, 0.999) * 3.0);
    vec2 g = p * cells;
    vec2 id = floor(g + 0.5);
    vec2 x = (g - id) * 4.5;                                    // phase space, about -2.3..2.3
    float h = hash21(id + 0.7);
    float om = 0.4 * sceneTime + 0.05 * audioAdvance + 6.2831853 * h;
    float sq = 1.0 + 1.5 * clamp(audioSwell, 0.0, 1.0) * h;
    float amp = 0.9 + 0.5 * hash11(h * 13.0);
    vec2 c1 = amp * vec2(cos(om), -sin(om));
    float W;
    if (hash11(h * 7.1) < clamp(catP, 0.0, 1.0)) {
        // a cat: two blobs on opposite sides and the fringes between them
        vec2 c2 = -c1;
        float blobs = 0.5 * (wigner(x, c1, om, 1.0) + wigner(x, c2, om, 1.0));
        vec2 dir = normalize(c1);
        float along = dot(x, vec2(-dir.y, dir.x));
        float fr = exp(-dot(x, x) * 2.0) * cos(4.0 * amp * along);
        W = blobs + fr;
    } else {
        // two states in this phase space: one squeezed, one round, a quarter period apart
        W = wigner(x, c1, om + 0.8, sq) + 0.8 * wigner(x, amp * 0.7 * vec2(sin(om), cos(om)), 0.0, 1.0);
    }
    vec2 uv = p * 0.7 + 0.5;
    vec3 photo = imgLod(uv, 0.5);
    vec3 tone = imgPalette(0.3 + 0.2 * W + 0.03 * audioPhase);
    vec3 pos = mix(tone * 1.2, photo * 1.4, 0.35 + 0.5 * clamp(photoP, 0.0, 1.0)) * clamp(W, 0.0, 1.0);
    vec3 neg = (vec3(1.0) - photo) * 0.6 * clamp(-W, 0.0, 1.0);    // negative quasi-probability: the photo's negative
    vec3 col = pos + neg + photo * 0.05;
    col += mix(tone, vec3(1.0), 0.5) * clamp(-W, 0.0, 1.0) * 0.2 * (0.5 + clamp(audioKick, 0.0, 1.0));
    // the axes of each phase space, faint
    vec2 ax = abs(x);
    col += tone * 0.06 * (exp(-ax.x * ax.x * 400.0) + exp(-ax.y * ax.y * 400.0));
    finish(col);
}
