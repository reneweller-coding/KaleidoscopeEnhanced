//@doc
 * @brief REACTION FRONTS ON PHOTO RELIEF: a reaction front (Fisher-KPP) whose speed depends on the relief of the photo: it runs downhill faster, hangs on the ridges and flows round the summits; the photo's brightness is the
 * height, the front is the edge of a spreading colour that lights the photo up behind it.  New seeds are sown at new places on every cycle and the picture fades before the next, so the fronts start again and again.  The field is a small
 * field of the scene's own.  The vigour of the front follows the swell of the music.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the vigour of the front (the growth rate)
 *
 * Knobs: slopeP (how strongly the relief steers the front), hueP.
//@params slopeP
//@audio audioSwell
//@state 320 180 240 32
//@body
/**  The photo coordinate of a field cell.
 *
 * @param c  The cell coordinate. (in)
 *
 * @return
 *   The photo coordinate.
 **/
vec2 photoUV(vec2 c) { return ((c / stateRes) - 0.5) * vec2(1.7778, 1.0) * 0.8 + 0.5; }
/**  The relief height of a cell: the photo's brightness, softened.
 *
 * @param c  The cell. (in)
 *
 * @return
 *   The height.
 **/
float heightOf(vec2 c) { return luma(imgLod(photoUV(c + 0.5), 2.5)); }
/**  One step of the front: diffusion, a drift down the relief and logistic growth (the state pass).
 *
 * @return
 *   u, 0, 0, 1.
 **/
vec4 stateStep()
{
    ivec2 ip = stCell();
    if (stateFrame < 0.5) return vec4(0.0, 0.0, 0.0, 1.0);
    float u = stAt(ip).r;
    float uE = stAt(ip + ivec2(1, 0)).r, uW = stAt(ip - ivec2(1, 0)).r, uN = stAt(ip + ivec2(0, 1)).r, uS = stAt(ip - ivec2(0, 1)).r;
    vec2 c = vec2(ip);
    vec2 grad = vec2(heightOf(c + vec2(1.0, 0.0)) - heightOf(c - vec2(1.0, 0.0)), heightOf(c + vec2(0.0, 1.0)) - heightOf(c - vec2(0.0, 1.0))) * 0.5;
    float kap = 30.0 * (0.3 + 1.4 * clamp(slopeP, 0.0, 1.0));
    vec2 vel = -kap * grad;
    float adv = -(vel.x > 0.0 ? vel.x * (u - uW) : vel.x * (uE - u)) - (vel.y > 0.0 ? vel.y * (u - uS) : vel.y * (uN - u));
    float h = heightOf(c);
    float r = 0.025 * (1.15 - 0.9 * h) * (0.5 + 1.0 * clamp(audioSwell, 0.0, 1.0));
    float dt = 0.5;
    float un = u + dt * (0.3 * (uE + uW + uN + uS - 4.0 * u) + clamp(adv, -0.3, 0.3) + r * u * (1.0 - u));
    float cyc = floor(stateFrame / 6000.0);
    float ph = mod(stateFrame, 6000.0);
    if (ph < 30.0) {
        for (int k = 0; k < 3; ++k) {
            vec2 at = stateRes * (0.15 + 0.7 * vec2(hash11(cyc * 5.1 + float(k) * 1.3), hash11(cyc * 2.7 + float(k) * 4.1 + 0.5)));
            vec2 d = c + 0.5 - at;
            un += 0.25 * exp(-dot(d, d) / 10.0);
        }
    }
    if (ph > 5200.0) un *= 0.985;
    return vec4(clamp(un, 0.0, 1.0), 0.0, 0.0, 1.0);
}
void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    vec2 cc = (p / vec2(asp, 1.0) + 0.5) * stateRes;
    float u = stLin(cc).r;
    vec3 c = imgLod(p * 0.8 + 0.5, 0.7);
    float front = 4.0 * u * (1.0 - u);
    finish(c * (0.3 + 0.85 * smoothstep(0.0, 0.9, u)) + 0.5 * front * mix(c, vec3(1.0), 0.6));
}
