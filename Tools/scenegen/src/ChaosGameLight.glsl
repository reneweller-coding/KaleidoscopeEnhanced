//@doc
 * @brief CHAOS GAME LIGHT: the fractal of the chaos game -- jump a fraction of the way toward a random corner of a
 * polygon, again and again -- whose corners lie outside the frame, so the fractal fills the screen, and the view
 * swings in toward one corner and out again through its self-similar layers.  A point belongs to the fractal when it
 * can be pulled back toward the nearest corner, over and over, without leaving the polygon: the light is how long it
 * stays, a smooth count that shows every level at once.  The jump fraction makes the copies just touch:
 * 1 / (2 (1 + cos(2 pi / n) + ...)) of the way (1/2 for the triangle, 1/(1 + phi) for the pentagon).  One colour
 * family from the photo, a shade per corner.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the number of corners steps with the chord changes (3, 5, 6, 8), the light of two counts
 *                       cross-faded
 *   audioAdvance     -> the swing in and out and the polygon's slow turn (integrated)
 *   audioSwell       -> the fractal's glow widens
 *
 * Knobs: swingP (how deep the view swings toward the corner), glowP (the light's reach), hueP.
//@params swingP glowP
//@audio audioHarmAdvance audioSwell
//@body
/**  The corner count of a step in the cycle 3, 5, 6, 8.
 *
 * @param k  The step. (in)
 *
 * @return
 *   The number of corners.
 **/
float cornerCount(float k)
{
    float m = mod(k, 4.0);
    return m < 0.5 ? 3.0 : m < 1.5 ? 5.0 : m < 2.5 ? 6.0 : 8.0;
}

/**  How long a point survives the pull-back toward the nearest corner of an n-gon (corners on the unit circle).
 *
 * @param z     The point. (in)
 * @param n     The number of corners. (in)
 * @param turn  The polygon's turn. (in)
 * @param c     Returns the corner of the last pull. (out)
 *
 * @return
 *   The smooth count, 0..24.
 **/
float chaosStay(vec2 z, float n, float turn, out float c)
{
    // the touching ratio: 1 / (2 (1 + sum of cos(2 pi k / n) for k up to n / 4))
    float sum = 1.0;
    for (int k = 1; k <= 2; ++k) if (float(k) <= floor(n / 4.0)) sum += cos(6.2831853 * float(k) / n);
    float r = 1.0 / (2.0 * sum);
    float cnt = 0.0;
    c = 0.0;
    for (int i = 0; i < 24; ++i) {
        float a = atan(z.y, z.x) - turn;
        float k = floor(a * n / 6.2831853 + 0.5);
        float ca = k * 6.2831853 / n + turn;
        vec2 v = vec2(cos(ca), sin(ca));
        z = v + (z - v) / r;
        c = mod(k, n);
        float l = length(z);
        if (l > 1.15) {
            cnt += 1.0 - clamp((l - 1.15) / 1.5, 0.0, 1.0);
            return cnt;
        }
        cnt += 1.0;
    }
    return cnt;
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float h = max(audioHarmAdvance, 0.0);
    float hk = floor(h), hm = smoothstep(0.15, 0.85, h - hk);
    float nA = cornerCount(hk), nB = cornerCount(hk + 1.0);
    float drift = 0.02 * sceneTime + 0.08 * audioAdvance;
    float swing = 0.5 - 0.5 * cos(0.8 * drift);
    float turn = 0.15 * drift;
    float zoom = 0.42 * exp(-swing * (1.0 + 2.2 * clamp(swingP, 0.0, 1.0)));
    // toward the corner at angle 'turn' (present in every polygon of the cycle)
    vec2 corner = vec2(cos(turn), sin(turn));
    vec2 z = mix(corner * 0.3, corner * 0.9, swing) + p * zoom * 1.6;
    // a point near the fractal survives some eight pulls more than its neighbours at this pixel size
    float reach = 1.5 * clamp(glowP, 0.0, 1.0) + 1.5 * clamp(audioSwell, 0.0, 1.0);
    vec3 col = vec3(0.0);
    for (int j = 0; j < 2; ++j) {
        float w = j == 0 ? 1.0 - hm : hm;
        if (w < 0.01) continue;
        float n = j == 0 ? nA : nB;
        float cn;
        float s = chaosStay(z, n, turn, cn);
        float g = smoothstep(1.5, 9.0 - reach, s);
        col += w * famLight(fh, fract(cn / n * 0.6 + 0.1), 0.35 * g * g) * g;
    }
    col += famCol(fh, 0.5) * 0.012;
    finish(col);
}
