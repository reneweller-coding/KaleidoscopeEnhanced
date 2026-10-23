//@doc
 * @brief PHOTO SANDPILE SLIDES: a sandpile whose grain heights are the brightness of the photo: new grains rain onto it, and where a column reaches four grains it slides, giving one to each neighbour; avalanches run through the
 * picture and change it into rills and cones, while the photo stays in the colours of the grains and slowly builds itself again where the sand has been swept away.  The rain of grains follows the swell of the music.  The sand lies in a
 * small field of the scene's own.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the rain of grains
 *
 * Knobs: restoreP (how fast the photo builds itself again), hueP.
//@params restoreP
//@audio audioSwell
//@state 320 180 30 32
//@body
/**  The photo coordinate of a field cell.
 *
 * @param c  The cell coordinate. (in)
 *
 * @return
 *   The photo coordinate.
 **/
vec2 photoUV(vec2 c) { return ((c / stateRes) - 0.5) * vec2(1.7778, 1.0) * 0.8 + 0.5; }
/**  One parallel toppling step of the sandpile (the state pass).
 *
 * @return
 *   The height, the flash of a slide, 0, 1.
 **/
vec4 stateStep()
{
    ivec2 ip = stCell();
    float target = floor(luma(imgLod(photoUV(vec2(ip) + 0.5), 1.5)) * 3.99 + stRand(1) * 0.6);
    if (stateFrame < 0.5) return vec4(clamp(target, 0.0, 3.0), 0.0, 0.0, 1.0);
    vec4 c = stAt(ip);
    float h = c.r;
    float topple = h >= 4.0 ? 1.0 : 0.0;
    float inc = (stAt(ip + ivec2(1, 0)).r >= 4.0 ? 1.0 : 0.0) + (stAt(ip - ivec2(1, 0)).r >= 4.0 ? 1.0 : 0.0)
              + (stAt(ip + ivec2(0, 1)).r >= 4.0 ? 1.0 : 0.0) + (stAt(ip - ivec2(0, 1)).r >= 4.0 ? 1.0 : 0.0);
    float hn = h - 4.0 * topple + inc;
    if (stRand(2) < 0.00035 * (0.2 + 1.8 * clamp(audioSwell, 0.0, 1.0))) hn += 1.0;
    if (stRand(3) < 0.0015 * (0.3 + 1.4 * clamp(restoreP, 0.0, 1.0))) hn = clamp(target, 0.0, 3.0);
    vec2 q = (vec2(ip) + 0.5) / stateRes;
    if (min(min(q.x, 1.0 - q.x), min(q.y, 1.0 - q.y)) < 1.5 / stateRes.y) hn = 0.0;
    return vec4(min(hn, 12.0), max(topple, c.g * 0.88), 0.0, 1.0);
}
void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    vec2 cc = (p / vec2(asp, 1.0) + 0.5) * stateRes;
    vec4 s = texelFetch(texState, ivec2(clamp(cc, vec2(0.0), stateRes - 1.0)), 0);
    vec3 c = imgLod(p * 0.8 + 0.5, 0.7);
    float h = s.r;
    float shade = 0.4 + 0.2 * min(h, 3.0);
    vec2 f = fract(cc) - 0.5;
    float grain = 0.9 + 0.1 * smoothstep(0.5, 0.2, length(f));
    finish(c * shade * grain * 1.1 + 0.5 * s.g * mix(c, vec3(1.0), 0.5));
}
