//@doc
 * @brief PHOTO GEODESIC FRONTS: wavefronts that run through the photo by the eikonal equation, slowed by its dark places and by its edges: bands of equal travel time that lie round the shapes of the picture, crowded where the going is
 * slow and wide where it is fast; the travel times are relaxed in a small field of the scene's own (a front-marching scheme that follows moving sources).  Three sources wander with the melody; the bands run outward from them and
 * the photo lies under the bands in its own colours.  The bands' contrast follows the swell.
 *
 * Audio Reactivity (structure, not only light):
 *   audioMelodyPitch -> the sources wander (smoothed, in the field)
 *   audioSwell      -> the contrast of the bands
 *
 * Knobs: bandP (the density of the bands), hueP.
//@params bandP
//@audio audioSwell audioMelodyPitch
//@state 320 180 600 32
//@body
/**  The photo coordinate of a field cell.
 *
 * @param c  The cell coordinate. (in)
 *
 * @return
 *   The photo coordinate.
 **/
vec2 photoUV(vec2 c) { return ((c / stateRes) - 0.5) * vec2(1.7778, 1.0) * 0.8 + 0.5; }
/**  The cost of crossing a cell: large where the photo is dark or has an edge.
 *
 * @param ip  The cell. (in)
 *
 * @return
 *   The cost.
 **/
float stepCost(ivec2 ip)
{
    vec2 uv = photoUV(vec2(ip) + 0.5);
    float l = luma(imgLod(uv, 2.0));
    float e = 0.006;
    vec2 g = vec2(luma(imgLod(uv + vec2(e, 0.0), 2.5)) - luma(imgLod(uv - vec2(e, 0.0), 2.5)), luma(imgLod(uv + vec2(0.0, e), 2.5)) - luma(imgLod(uv - vec2(0.0, e), 2.5)));
    float sp = (0.2 + 0.8 * l) * (1.0 - 0.6 * smoothstep(0.0, 0.08, length(g)));
    return 1.0 / max(sp, 0.08);
}
/**  One relaxation step of the travel times (the state pass).
 *
 * @return
 *   The travel time, the smoothed melody, 0, 1.
 **/
vec4 stateStep()
{
    ivec2 ip = stCell();
    float mel = clamp(audioMelodyPitch, 0.0, 1.0);
    if (stateFrame < 0.5) return vec4(1.0e4, mel, 0.0, 1.0);
    vec4 c = stAt(ip);
    float sm = c.g + (mel - c.g) * 0.01;
    float cost = stepCost(ip);
    float best = c.r + 0.03;
    best = min(best, stAt(ip + ivec2(1, 0)).r + cost);
    best = min(best, stAt(ip - ivec2(1, 0)).r + cost);
    best = min(best, stAt(ip + ivec2(0, 1)).r + cost);
    best = min(best, stAt(ip - ivec2(0, 1)).r + cost);
    best = min(best, stAt(ip + ivec2(1, 1)).r + 1.414 * cost);
    best = min(best, stAt(ip + ivec2(-1, 1)).r + 1.414 * cost);
    best = min(best, stAt(ip + ivec2(1, -1)).r + 1.414 * cost);
    best = min(best, stAt(ip - ivec2(1, 1)).r + 1.414 * cost);
    for (int k = 0; k < 3; ++k) {
        float fk = float(k);
        vec2 sp = stateRes * (0.5 + 0.34 * vec2(sin(0.00006 * stateFrame + 2.1 * fk + 3.0 * sm), cos(0.00005 * stateFrame * 1.3 + 1.7 * fk - 2.0 * sm)));
        if (length(vec2(ip) + 0.5 - sp) < 2.0) best = 0.0;
    }
    return vec4(min(best, 1.0e4), sm, 0.0, 1.0);
}
void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    vec2 cc = (p / vec2(asp, 1.0) + 0.5) * stateRes;
    float T = stLin(cc).r;
    float K = 0.012 + 0.04 * clamp(bandP, 0.0, 1.0);
    float s = (T - 6.0 * sceneTime) * K;
    float f = fract(s);
    float band = smoothstep(0.0, 0.35, f) * smoothstep(1.0, 0.65, f);
    float reached = smoothstep(9000.0, 5000.0, T);
    vec3 c = imgLod(p * 0.8 + 0.5, 0.7);
    float ct = 0.3 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float line = smoothstep(0.06, 0.0, abs(f - 0.5) - 0.44);
    finish(c * mix(0.55, 0.6 + ct * 0.7 * band, reached) * 1.1 + 0.3 * line * reached * mix(c, vec3(1.0), 0.5));
}
