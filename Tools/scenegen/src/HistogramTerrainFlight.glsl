//@doc
 * @brief HISTOGRAM TERRAIN FLIGHT: a flight over a mountain range made of the photo's histogram: for every column of the photo the brightnesses form a ridge, high where many pixels have that brightness, so the range is the
 * photo's own distribution of tones laid out as land -- sharp crests where the photo is flat, broad hills where it is busy; the colours of the ground are the colours of the photo's channels there, the sky the photo's soft blur.
 * The histogram is counted in a small field of the scene's own, a few times a second.  The flight follows the drive of the music, the height of the range the swell.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the flight (integrated)
 *   audioSwell      -> the height of the range
 *
 * Knobs: heightP (the base height), hueP.
//@params heightP
//@audio audioSwell
//@state 96 64 6 32
//@body
/**  The state pass: for every column of the photo and every brightness step the share of its pixels in that step, per colour channel (rgb) and in luma (a).
 *
 * @return
 *   The density, r g b a, smoothed against the last step.
 **/
vec4 stateStep()
{
    ivec2 c = stCell();
    float bin = float(c.y);
    vec4 sum = vec4(0.0);
    for (int i = 0; i < 4; ++i) {
        for (int j = 0; j < 40; ++j) {
            vec2 uv = vec2((float(c.x) + (float(i) + 0.5) / 4.0) / 96.0, (float(j) + 0.5) / 40.0);
            vec3 s = clamp(imgLod(uv, 2.0), 0.0, 0.999);
            vec3 b3 = floor(s * 64.0);
            sum.r += b3.r == bin ? 1.0 : 0.0;
            sum.g += b3.g == bin ? 1.0 : 0.0;
            sum.b += b3.b == bin ? 1.0 : 0.0;
            sum.a += floor(luma(s) * 64.0) == bin ? 1.0 : 0.0;
        }
    }
    vec4 now = sum / 160.0;
    vec4 old = stateFrame < 0.5 ? now : texelFetch(texState, c, 0);
    return mix(old, now, 0.35);
}
/**  The terrain's density (the histogram) at a world place.
 *
 * @param xz  The place; x across the columns, y along the brightnesses, both in units of 4. (in)
 *
 * @return
 *   The state (rgb densities, luma density).
 **/
vec4 terrainAt(vec2 xz)
{
    vec2 m = 1.0 - abs(fract(xz * 0.125 + 0.5) * 2.0 - 1.0);
    vec2 c = vec2(m.x * 96.0, m.y * 64.0);
    return 0.4 * stLin(c) + 0.15 * (stLin(c + vec2(0.0, 1.5)) + stLin(c - vec2(0.0, 1.5)) + stLin(c + vec2(1.5, 0.0)) + stLin(c - vec2(1.5, 0.0)));
}
/**  The colour of the ground at a world place: the photo's average colour in that column, as bright as the brightness step.
 *
 * @param xz  The place. (in)
 *
 * @return
 *   The colour.
 **/
vec3 terrainCol(vec2 xz)
{
    vec2 m = 1.0 - abs(fract(xz * 0.125 + 0.5) * 2.0 - 1.0);
    vec3 c = imgLod(vec2(m.x, 0.5 + 0.25 * (m.y - 0.5)), 5.5);
    return c / max(luma(c), 0.08) * (0.25 + 0.9 * m.y);
}
void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float amp = (0.35 + 0.5 * clamp(heightP, 0.0, 1.0)) * (0.6 + 0.8 * clamp(audioSwell, 0.0, 1.0));
    float adv = 0.04 * audioAdvance + 0.03 * sceneTime;
    vec3 ro = vec3(4.0 * sin(0.015 * audioAdvance + 0.01 * sceneTime), 1.3 * amp + 0.35, 4.0 * adv);
    vec3 fw = normalize(vec3(0.15 * sin(0.02 * audioAdvance), -0.38, 1.0));
    vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
    vec3 up = cross(fw, rt);
    vec3 rd = normalize(fw + p.x * 1.1 * rt + p.y * 1.1 * up);
    float t = 0.1;
    float hit = 0.0;
    vec3 pos = ro;
    for (int i = 0; i < 90; ++i) {
        pos = ro + rd * t;
        vec4 s = terrainAt(pos.xz);
        float h = amp * 1.6 * pow(clamp(s.a * 1.6, 0.0, 4.0), 0.55);
        if (pos.y < h) { hit = 1.0; break; }
        t += 0.05 + 0.04 * t;
        if (t > 22.0) break;
    }
    vec3 sky = imgLod(vec2(0.5 + 0.3 * p.x, 0.5 + 0.5 * p.y), 5.0) * (0.9 + 0.3 * smoothstep(-0.3, 0.5, p.y));
    vec3 col = sky;
    if (hit > 0.5) {
        vec2 e = vec2(0.08, 0.0);
        float h0 = amp * 1.6 * pow(clamp(terrainAt(pos.xz).a * 1.6, 0.0, 4.0), 0.55);
        float hx = amp * 1.6 * pow(clamp(terrainAt(pos.xz + e.xy).a * 1.6, 0.0, 4.0), 0.55);
        float hz = amp * 1.6 * pow(clamp(terrainAt(pos.xz + e.yx).a * 1.6, 0.0, 4.0), 0.55);
        vec3 n = normalize(vec3(-(hx - h0) / e.x, 1.0, -(hz - h0) / e.x));
        vec4 s = terrainAt(pos.xz);
        vec3 gc = terrainCol(pos.xz);
        float lam = clamp(dot(n, normalize(vec3(0.5, 0.8, -0.3))), 0.0, 1.0);
        vec3 ground = gc * (0.3 + 0.9 * lam) * (0.6 + 0.6 * clamp(pos.y / (amp + 0.3), 0.0, 1.0));
        float fog = 1.0 - exp(-0.07 * t);
        col = mix(ground * 1.15, sky, fog);
    }
    finish(col);
}
