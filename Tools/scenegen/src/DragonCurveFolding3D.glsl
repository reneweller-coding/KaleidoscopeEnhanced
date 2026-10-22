//@doc
 * @brief DRAGON CURVE FOLDING 3D: four Heighway dragons round one point, the paper-folding curve folded again and
 * again, drawn as glowing bands in several layers -- the curve of a coarse fold underneath, finer folds above it --
 * that fold up and open out again as the music goes.  The dragon is the attractor of z -> A z and z -> 1 - B z with
 * A = r e^(i a), B = r e^(-i a), r = 1 / (2 cos a); a point's distance to the n-fold curve is found by unfolding it
 * back n times (all branches for the first three, then the nearer one).  The fold angle a = 45 degrees is the
 * classic dragon.  One colour family from the photo, a shade per layer.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos -> each phrase folds the curve once more and back (gliding: the light of the two fold counts is
 *                     cross-faded)
 *   audioChromaHue -> the key sets the fold angle round 45 degrees
 *   audioAdvance   -> the figure turns (integrated)
 *   audioSwell     -> the bands widen
 *
 * Knobs: foldP (the base number of folds), bandP (the bands' width), hueP.
//@params foldP bandP
//@audio audioPhrasePos audioChromaHue audioSwell
//@body
/**  The complex product.
 *
 * @param a  One factor. (in)
 * @param b  The other. (in)
 *
 * @return
 *   a b.
 **/
vec2 cmulD(vec2 a, vec2 b)
{
    return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

/**  The distance to a segment from 0 to 1 on the real axis.
 *
 * @param w  The point. (in)
 *
 * @return
 *   The distance.
 **/
float unitSeg(vec2 w)
{
    return length(vec2(w.x - clamp(w.x, 0.0, 1.0), w.y));
}

/**  The distance to the n-fold paper-folding curve from 0 to 1.
 *
 * @param z    The point. (in)
 * @param n    How many folds (at most 14). (in)
 * @param iA   1 / A. (in)
 * @param iB   1 / B. (in)
 * @param r    |A| = |B|. (in)
 *
 * @return
 *   The distance.
 **/
float dragonDist(vec2 z, int n, vec2 iA, vec2 iB, float r)
{
    const vec2 C = vec2(0.45, 0.12);                             // about the attractor's middle
    float best = 1e9;
    for (int leaf = 0; leaf < 8; ++leaf) {
        vec2 w = z;
        float s = 1.0;
        for (int k = 0; k < 14; ++k) {
            if (k >= n) break;
            vec2 w1 = cmulD(w, iA), w2 = cmulD(vec2(1.0, 0.0) - w, iB);
            bool second = k < 3 ? ((leaf >> k) & 1) == 1 : dot(w2 - C, w2 - C) < dot(w1 - C, w1 - C);
            w = second ? w2 : w1;
            s *= r;
        }
        best = min(best, unitSeg(w) * s);
    }
    return best;
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float ang = 0.7854 + 0.14 * sin(audioChromaHue);
    float r = 0.5 / cos(ang);
    vec2 A = r * vec2(cos(ang), sin(ang)), B = r * vec2(cos(ang), -sin(ang));
    vec2 iA = vec2(A.x, -A.y) / (r * r), iB = vec2(B.x, -B.y) / (r * r);
    float folds = 7.0 + 3.0 * clamp(foldP, 0.0, 1.0) + 1.0 * sin(6.2831853 * audioPhrasePos);
    float fk = floor(folds), fm = smoothstep(0.2, 0.8, folds - fk);
    float band = (1.0 + 1.2 * clamp(bandP, 0.0, 1.0)) * (0.9 + 0.5 * clamp(audioSwell, 0.0, 1.0));
    float turn = 0.02 * sceneTime + 0.1 * audioAdvance;
    vec2 z0 = rot2(turn) * p * (0.95 + 0.15 * sin(0.03 * sceneTime));
    float px = 1.0 / resolution.y;
    vec3 col = vec3(0.0);
    for (int q = 0; q < 4; ++q) {
        vec2 z = rot2(1.5707963 * float(q)) * z0;
        float dA = dragonDist(z, int(fk), iA, iB, r), dB = dragonDist(z, int(fk) + 1, iA, iB, r);
        float dCoarse = dragonDist(z, int(fk) - 3, iA, iB, r);
        float gA = exp(-pow(dA / (px * band), 2.0)), gB = exp(-pow(dB / (px * band * 0.8), 2.0));
        float gC = exp(-pow(dCoarse / (px * band * 4.0), 2.0));
        float sh = 0.15 + 0.2 * float(q);
        col += famLight(fh, sh, 0.3) * ((1.0 - fm) * gA + fm * gB) * 0.8 + famCol(fh, sh + 0.3) * gC * 0.25;
        col += famCol(fh, sh) * 0.05 * exp(-min(dA, dB) / (px * 20.0));
    }
    col += famCol(fh, 0.5) * 0.012;
    finish(col);
}
