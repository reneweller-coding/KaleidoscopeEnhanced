//@doc
 * @brief LIGHT THREAD WEAVE 3D: three sets of glowing threads along the three axes, woven into one another in space:
 * each thread waves over and under its neighbours, the waves of adjacent threads in opposite phase, so the sets
 * interlock like cloth in three directions; the eye flies through the weave.  Each set is shifted half a mesh
 * against the others, so threads never cross.  One colour family from the photo, each set its own shade.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance       -> the waves run along the threads (integrated): the weave ripples; and the flight
 *   audioSectionId/Age -> every new section changes the weave's density (a second, finer weave fades in or out
 *                         over six seconds)
 *   audioSwell         -> the waves' depth
 *   audioOnset         -> the threads' crossings flash (light)
 *
 * Knobs: meshP (the mesh's size), threadP (the threads' thickness), hueP.
//@params meshP threadP
//@audio audioSectionId audioSectionPrev audioSectionAge audioSwell audioOnset
//@body
/**  One set of threads along s, at a square grid across (w), waving across by amp with the phase ph.
 *
 * @param s    The coordinate along the threads. (in)
 * @param w    The coordinates across. (in)
 * @param M    The mesh. (in)
 * @param amp  The waves' depth. (in)
 * @param ph   The waves' phase. (in)
 *
 * @return
 *   The distance to the nearest thread.
 **/
float threadSet(float s, vec2 w, float M, float amp, float ph)
{
    vec2 id = floor(w / M + 0.5);
    vec2 q = w - id * M;
    float par = mod(id.x + id.y, 2.0) * 2.0 - 1.0;              // neighbours wave in opposite phase
    float a = 3.14159265 * s / M + ph;
    float off = par * amp * sin(a);
    float slope = par * amp * 3.14159265 / M * cos(a);
    vec2 d = vec2(q.x - off, q.y - 0.5 * off);
    return length(d) / sqrt(1.0 + slope * slope);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float M = 1.4 + 0.8 * clamp(meshP, 0.0, 1.0);
    float th = 0.02 + 0.02 * clamp(threadP, 0.0, 1.0);
    float amp = M * (0.12 + 0.1 * clamp(audioSwell, 0.0, 1.0));
    float ph = 0.8 * audioAdvance + 0.05 * sceneTime;
    float fine = mix(mod(max(audioSectionPrev, 0.0), 2.0), mod(max(audioSectionId, 0.0), 2.0),
                     smoothstep(0.0, 6.0, audioSectionAge));
    float flash = clamp(audioOnset, 0.0, 1.0);
    float fly = 0.3 * sceneTime + 1.3 * audioAdvance;
    vec3 ro = vec3(0.25 * M + 0.2 * sin(0.04 * fly), 0.25 * M + 0.2 * cos(0.035 * fly), fly);
    vec3 rd = normalize(vec3(p, 1.1));
    rd.xz = rot2(0.35 * sin(0.021 * sceneTime)) * rd.xz;
    rd.yz = rot2(0.25 * sin(0.017 * sceneTime + 1.0)) * rd.yz;
    rd.xy = rot2(0.012 * sceneTime) * rd.xy;
    vec3 col = vec3(0.0);
    float t = 0.05;
    for (int i = 0; i < 110; ++i) {
        vec3 x = ro + rd * t;
        float h = 0.5 * M;
        float dx = threadSet(x.x, x.yz, M, amp, ph) - th;
        float dy = threadSet(x.y, x.zx + h, M, amp, ph + 2.1) - th;
        float dz = threadSet(x.z, x.xy + vec2(0.0, h), M, amp, ph + 4.2) - th;
        float gx = 1.0 / (1.0 + pow(max(dx, 0.0) * 30.0, 2.0));
        float gy = 1.0 / (1.0 + pow(max(dy, 0.0) * 30.0, 2.0));
        float gz = 1.0 / (1.0 + pow(max(dz, 0.0) * 30.0, 2.0));
        // the finer weave: the same at half the mesh, its light cross-faded in by the section
        float M2 = 0.5 * M;
        float ex = threadSet(x.x + 0.3, x.yz + 0.25 * M, M2, 0.5 * amp, ph) - 0.7 * th;
        float ey = threadSet(x.y + 0.3, x.zx + 0.25 * M + 0.5 * M2, M2, 0.5 * amp, ph + 2.1) - 0.7 * th;
        float ez = threadSet(x.z + 0.3, x.xy + vec2(0.25 * M, 0.25 * M + 0.5 * M2), M2, 0.5 * amp, ph + 4.2) - 0.7 * th;
        float gf = fine * (1.0 / (1.0 + pow(max(ex, 0.0) * 40.0, 2.0)) + 1.0 / (1.0 + pow(max(ey, 0.0) * 40.0, 2.0))
                           + 1.0 / (1.0 + pow(max(ez, 0.0) * 40.0, 2.0)));
        float cross_ = gx * gy + gy * gz + gz * gx;                   // where the sets come close
        float fade = exp(-0.1 * t) * smoothstep(0.05, 0.5, t);
        col += (famLight(fh, 0.2, 0.1) * gx + famLight(fh, 0.5, 0.1) * gy + famLight(fh, 0.8, 0.1) * gz
                + famLight(fh, 0.5, 0.2) * gf * 0.6 + famLight(fh, 0.5, 0.7) * cross_ * flash * 3.0) * fade * 0.065;
        float d = min(min(dx, dy), dz);
        d = min(d, fine > 0.01 ? min(min(ex, ey), ez) : 1e3);
        t += clamp(0.6 * d, 0.015, 0.3);
        if (t > 26.0) break;
    }
    col += famCol(fh, 0.5) * 0.012;
    finish(col);
}
