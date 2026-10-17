//@doc
 * @brief SPIDERWEB TESSELLATION: a spider web as a tiling -- spokes from a centre and rings of straight threads between
 * them, each ring a fixed factor wider than the last, so the web is self-similar: zooming by that factor gives the
 * same web again.  It zooms endlessly into its own centre (or out of it), the cells between the threads holding cuts
 * of the photo, the threads glistening.  Mirrored copies of the web fill the frame's corners.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> each change of harmony changes the number of spokes (crossfaded)
 *   audioAdvance    -> the zoom (integrated: the web streams toward its centre)
 *   audioKick       -> the threads glisten (light)
 *
 * Knobs: spokesP (the base number of spokes), ringP (the ring factor), threadP (thread width), hueP.
//@params spokesP ringP threadP
//@audio audioKick audioHarmAdvance
//@body
/**  The web at a point: which cell, and the distance to the nearest thread.
 *
 * @param p  The point (centred on the web). (in)
 * @param n  The number of spokes. (in)
 * @param q  The ring factor. (in)
 * @param z  The zoom (in rings, fractional). (in)
 *
 * @return
 *   Ring index (x), spoke index (y), distance to a thread (z).
 **/
vec3 web(vec2 p, float n, float q, float z)
{
    float a = atan(p.y, p.x), r = length(p);
    float sec = 6.2831853 / n;
    float k = floor(a / sec);
    float am = a - (k + 0.5) * sec;                             // the angle within the sector, centred
    // the ring threads are straight chords between the spokes: the radius along the sector's bisector
    float rr = r * cos(am) / cos(0.5 * sec);
    float lr = log(max(rr, 1e-4)) / log(q) + z;
    float ring = floor(lr);
    float dRing = min(fract(lr), 1.0 - fract(lr)) * rr * log(q);
    float dSpoke = abs(abs(am) - 0.5 * sec) * r;
    return vec3(ring, k, min(dRing, dSpoke));
}

void main()
{
    vec2 p = screenP();
    float h = max(audioHarmAdvance, 0.0);
    float base = 6.0 + floor(6.0 * clamp(spokesP, 0.0, 0.999));
    float nA = base + 2.0 * mod(floor(h), 3.0), nB = base + 2.0 * mod(floor(h) + 1.0, 3.0);
    float g = smoothstep(0.2, 0.8, fract(h));
    float q = 1.3 + 0.4 * clamp(ringP, 0.0, 1.0);
    float z = 0.08 * sceneTime + 0.01 * audioAdvance;
    float tw = 0.002 + 0.004 * clamp(threadP, 0.0, 1.0);
    vec3 col = vec3(0.0);
    for (int j = 0; j < 2; ++j) {
        float n = j == 0 ? nA : nB;
        float w = j == 0 ? 1.0 - g : g;
        if (w < 0.001) continue;
        vec3 c = web(p, n, q, z);
        float hh = hash21(vec2(mod(c.x, 7.0), c.y));
        vec2 uv = p * 0.6 + 0.5 + vec2(hh, fract(hh * 3.7)) * 0.25;
        vec3 photo = imgLod(uv, 0.5);
        vec3 tone = imgPalette(hh + 0.03 * audioPhase);
        vec3 cc = mix(photo, photo * tone * 1.6, 0.3) * (0.6 + 0.5 * hh);
        float thread = 1.0 - smoothstep(tw * 0.5, tw * 1.5, c.z);
        cc = mix(cc, mix(tone, vec3(1.0), 0.6) * (0.6 + 0.8 * clamp(audioKick, 0.0, 1.0)), thread);
        col += w * cc;
    }
    finish(col);
}
