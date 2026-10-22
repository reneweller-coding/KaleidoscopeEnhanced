//@doc
 * @brief CURVE SHORTENING LOOPS: a dense field of closed glowing curves filling the plane; each rounds itself off
 * under the curve-shortening flow -- its wiggles smooth out, the fine ones first, until it is a circle that shrinks
 * to a point and fades -- while new curves are born between them.  A curve is star-shaped, r(theta) = R (1 + sum of
 * a_k cos(k theta + phi_k)); under the flow its k-th wiggle fades about as e^(-k^2 tau) and a circle's radius shrinks
 * as R^2 = R0^2 - 2 tau, so its life is a single clock tau.  Each cell of a jittered grid carries a curve at its own
 * point in life.  The curves' light is shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the flow's speed: louder music, faster rounding
 *   audioAdvance -> the curves' lives run on (integrated)
 *
 * Knobs: wiggleP (how wild the new curves are), cellP (the cells' size), hueP.
//@params wiggleP cellP
//@audio audioSwell
//@state 1 1 60 32
//@body
/**  The state pass: a clock whose speed follows the swell, summed step by step (so its speed changes, never its
 * reading).
 *
 * @return
 *   The clock, 0, 0, 1.
 **/
vec4 stateStep()
{
    float prev = stateFrame < 0.5 ? 0.0 : texelFetch(texState, ivec2(0, 0), 0).r;
    return vec4(prev + (0.03 + 0.04 * clamp(audioSwell, 0.0, 1.0)) / 60.0, 0.0, 0.0, 1.0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    float swellClock = texelFetch(texState, ivec2(0, 0), 0).r;   // seconds, run faster as the music swells
    vec2 p = screenP();
    float fh = famHue();
    float S = 0.3 + 0.2 * clamp(cellP, 0.0, 1.0);
    float wild = 0.15 + 0.25 * clamp(wiggleP, 0.0, 1.0);
    float clock = swellClock + 0.12 * audioAdvance;
    vec2 g0 = floor(p / S);
    vec3 col = vec3(0.0);
    for (int j = -1; j <= 1; ++j)
    for (int i = -1; i <= 1; ++i) {
        vec2 cid = g0 + vec2(float(i), float(j));
        float hc = fract(sin(dot(cid, vec2(12.9898, 78.233))) * 43758.5453);
        vec2 c = (cid + 0.5 + 0.5 * (vec2(fract(hc * 7.3), fract(hc * 3.1)) - 0.5)) * S;
        float life = fract(clock + hc);                          // 0 born .. 1 vanished
        float tau = life * 0.12;
        float R0 = S * (0.45 + 0.3 * fract(hc * 5.7));
        float R = R0 * sqrt(max(1.0 - 0.95 * life, 0.0));        // R^2 falls linearly with the flow's time
        vec2 d = p - c;
        float th = atan(d.y, d.x);
        float wig = 0.0;
        for (int k = 2; k <= 7; ++k) {
            float fk = float(k);
            float ak = wild * fract(sin(hc * 91.7 + fk * 13.1) * 43758.5453) / fk;
            wig += ak * exp(-fk * fk * tau * 6.0) * cos(fk * th + 6.2831853 * fract(hc * fk));
        }
        float r = R * (1.0 + wig);
        float dist = abs(length(d) - r);
        float fade = smoothstep(0.0, 0.08, life) * (1.0 - smoothstep(0.75, 1.0, life));
        col += famLight(fh, fract(hc * 3.3), 0.3) * exp(-pow(dist / 0.004, 2.0)) * fade;
    }
    col += famCol(fh, 0.45) * 0.015;
    finish(famExpose(col, 7.00, 0.80, 0.03, fh));
}
