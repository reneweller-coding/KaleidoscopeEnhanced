//@doc
 * @brief WIREFRAME RIDGE SCAN: a wire mesh over the photo whose height is the brightness and whose lines are visible only where it climbs; the mesh turns slowly.  A ray is marched over the height field (brightness as height), at the hit point the lines of the grid in terrain space are drawn, and they glow where the slope
 * is steep and fade on the flats.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread  -> the number of lines (smoothed)
 *   audioAdvance -> the mesh turns (integrated)
 *
 * Knobs: sizeP (the height of the relief), hueP.
//@params sizeP
//@audio audioSpread audioAdvance
//@body
float terr(vec2 xz)
{
    return luma(imgLod(xz * 0.5 * 0.85 + 0.5, 2.0));
}
void main()
{
    vec2 p = screenP();
    float ang = 0.015 * audioAdvance + 0.02 * sceneTime;
    float A = 0.35 + 0.35 * clamp(sizeP, 0.0, 1.0);
    vec3 ro = vec3(1.45 * sin(ang), 1.05, -1.45 * cos(ang));
    vec3 fw = normalize(vec3(0.0, 0.1, 0.0) - ro);
    vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
    vec3 up = cross(fw, rt);
    vec3 rd = normalize(fw + p.x * 1.1 * rt + p.y * 1.1 * up);
    float t = 0.5;
    float hit = 0.0;
    vec3 pos = ro;
    float prevD = 1.0;
    for (int i = 0; i < 64; ++i) {
        pos = ro + rd * t;
        float h = terr(pos.xz) * A;
        float d = pos.y - h;
        if (d < 0.0 && abs(pos.x) < 1.0 && abs(pos.z) < 1.0) { hit = 1.0; break; }
        t += max(d * 0.5, 0.025);
        if (t > 6.0) break;
    }
    vec3 col = imgLod(p * 0.85 + 0.5, 3.0) * 0.08 + vec3(0.01, 0.015, 0.03);
    if (hit > 0.5) {
        float e = 0.02;
        float h0 = terr(pos.xz) * A;
        float hx = terr(pos.xz + vec2(e, 0.0)) * A - h0;
        float hz = terr(pos.xz + vec2(0.0, e)) * A - h0;
        float slope = length(vec2(hx, hz)) / e;
        float K = 12.0 + 18.0 * clamp(audioSpread, 0.0, 1.0);
        vec2 gv = abs(fract(pos.xz * K * 0.5) - 0.5);
        float line = 1.0 - smoothstep(0.0, 0.06 + 0.0 * slope, min(gv.x, gv.y));
        vec3 c = imgLod(pos.xz * 0.5 * 0.85 + 0.5, 1.0);
        c = mix(vec3(luma(c)), c, 1.4);
        float vis = smoothstep(0.05, 0.6, slope * 1.2 + 0.2);
        col = c * 0.12 + c * 1.8 * line * vis + vec3(0.25, 0.35, 0.5) * line * 0.2;
    }
    finish(col);
}
