//@doc
 * @brief SPICULE STAR DRIFT: a dense swarm of star-shaped glass spicules -- the silica needles of sponges and
 * radiolarians -- surrounds the eye at many depths and drifts past: sharp glassy stars in the middle distance, the
 * nearest ones blurred into soft bokeh discs, the farthest small and dim; the stars' number of points changes with the
 * chords.  The swarm is seven layers of jittered cells, each scrolled by the drift divided by its depth; a spicule is
 * a star outline (radius swelling n times round) with bright glassy edges, its blur growing with its distance from
 * the focal depth.  The glass is shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the stars' number of points changes with the chords (cross-faded)
 *   audioAdvance     -> the swarm drifts past and the stars turn (integrated)
 *   audioSwell       -> the glass' glow
 *
 * Knobs: densP (how dense the swarm is), sizeP (the stars' size), hueP.
//@params densP sizeP
//@audio audioHarmAdvance audioSwell
//@body
/**  A spicule star's outline radius at an angle.
 *
 * @param a  The angle. (in)
 * @param n  The number of points. (in)
 *
 * @return
 *   The radius (1 at the points).
 **/
float starR(float a, float n)
{
    return 0.22 + 0.78 * pow(abs(cos(0.5 * n * a)), 6.0);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float h = max(audioHarmAdvance, 0.0);
    float hk = floor(h), hm = smoothstep(0.15, 0.85, h - hk);
    float nA = 3.0 + mod(hk * 2.0, 4.0), nB = 3.0 + mod((hk + 1.0) * 2.0, 4.0);
    float drift = 0.03 * sceneTime + 0.12 * audioAdvance;
    float W = 0.32 - 0.1 * clamp(densP, 0.0, 1.0);
    float sz = 0.06 + 0.04 * clamp(sizeP, 0.0, 1.0);
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec3 col = famCol(fh, 0.45) * 0.015;
    for (int l = 6; l >= 0; --l) {                                   // far to near
        float fl = float(l);
        float z = 0.5 + 0.45 * fl;
        float S = W / z;
        vec2 q = p / S + vec2(0.7, 0.25) * drift / z * 3.0 + 13.1 * fl;
        vec2 cid = floor(q);
        vec2 f = q - cid;
        float hs = hash21(cid + 7.0 * fl);
        vec2 c = 0.36 + 0.28 * hash22(cid + 3.0 * fl);
        float R = min(sz / z / S, 0.22);                              // the star's size in cell units (it stays in its cell)
        vec2 d = rot2(6.2831853 * hs + drift * (0.5 + hs) * (hs < 0.5 ? 1.0 : -1.0)) * (f - c);
        float r = length(d) / R, a = atan(d.y, d.x);
        float rs = (1.0 - hm) * starR(a, nA) + hm * starR(a, nB);
        float blur = 0.03 + 0.5 * abs(1.0 / z - 1.0 / 1.4);           // sharp near the focal depth, soft elsewhere
        float body = smoothstep(rs + blur, rs - blur, r);
        float edge = exp(-pow((r - rs) / (0.08 + blur), 2.0));
        float bokeh = smoothstep(1.05, 0.9, r) * smoothstep(0.0, 0.6, blur - 0.1);
        float lit = (body * 0.25 + edge * 0.8) * (1.0 - smoothstep(0.1, 0.5, blur)) + bokeh * 0.18;
        col += famLight(fh, 0.3 + 0.4 * hs, 0.5) * lit * glow * exp(-0.25 * fl) * smoothstep(1.35, 1.2, r);
    }
    finish(famExpose(col, 1.70, 1.00, 0.00, fh));
}
