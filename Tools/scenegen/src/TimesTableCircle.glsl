//@doc
 * @brief TIMES TABLE CIRCLE: several times-table circles -- point k on a circle joined to point m k -- so large that
 * their nets of lines fill the picture, offset and laid over one another; as m glides the envelopes of the lines turn
 * from a cardioid (m = 2) into a nephroid (m = 3) and on into stars of more cusps, and back.  Each circle has a fixed
 * number of points; how many of its lines are drawn follows the music's loudness (taken in a scattered order, so any
 * share spans the whole circle), the newest line fading in.  The lines are shades of one colour family from the photo;
 * their crossings add up into the glowing envelopes.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> m glides (integrated): cardioid, nephroid, stars, and back
 *   audioSwell   -> how many lines each circle draws (the loudness envelope; the newest line fades in)
 *
 * Knobs: pointP (how many points a circle has), circleP (how many circles), hueP.
//@params pointP circleP
//@audio audioSwell
//@body
/**  The distance from a point to a segment.
 *
 * @param p  The point. (in)
 * @param a  The segment's start. (in)
 * @param b  The segment's end. (in)
 *
 * @return
 *   The distance.
 **/
float segD(vec2 p, vec2 a, vec2 b)
{
    vec2 ab = b - a, ap = p - a;
    return length(ap - ab * clamp(dot(ap, ab) / max(dot(ab, ab), 1e-8), 0.0, 1.0));
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float N = floor(120.0 + 80.0 * clamp(pointP, 0.0, 1.0));
    if (mod(N, 61.0) < 0.5) N += 1.0;                                // (61 must not divide N: the lines' order below)
    float NC = floor(2.0 + 1.0 * clamp(circleP, 0.0, 1.0) + 0.5);
    float vis = N * (0.45 + 0.55 * clamp(audioSwell, 0.0, 1.0));
    float m = 4.0 - 2.0 * cos(0.01 * sceneTime + 0.04 * audioAdvance);
    vec3 col = famCol(fh, 0.45) * 0.015;
    for (int c = 0; c < 3; ++c) {
        float fc = float(c);
        if (fc >= NC) break;
        vec2 ctr = vec2(0.45 * (fc - 0.5 * (NC - 1.0)), 0.06 * sin(fc * 2.0));
        float R = 0.82 - 0.08 * fc;
        float rot = 0.4 * fc + 0.01 * sceneTime;
        float mc = m + 0.37 * fc;
        float acc = 0.0;
        for (int k = 0; k < 200; ++k) {
            float fk = float(k);
            if (fk >= N) break;
            float w = clamp(vis - fk, 0.0, 1.0);
            if (w <= 0.0) break;
            float kk = mod(fk * 61.0, N);                                // scattered: any share spans the circle
            float a1 = 6.2831853 * kk / N + rot, a2 = 6.2831853 * kk * mc / N + rot;
            float d = segD(p, ctr + R * vec2(cos(a1), sin(a1)), ctr + R * vec2(cos(a2), sin(a2)));
            acc += exp(-pow(d / 0.0014, 2.0)) * w;
        }
        col += famLight(fh, 0.3 + 0.2 * fc, 0.4) * acc * 0.35;
    }
    finish(col);
}
