//@doc
 * @brief STRIP LAB: time slices -- the photo moves (it pans in a circle, turns, breathes, sways, runs a Lissajous
 * figure) and a scanner reads it: every pixel sees the photo at its own moment, the moment being set by where the pixel
 * lies -- a row scan (rolling shutter), a column scan (a slit camera), a diagonal scan, a radial scan from the centre,
 * a spiral scan, a wavy scan.  The picture is a stack of moments: straight things bend into the path's shape, and a
 * slow sway becomes a standing wave across the screen.  The second stage chooses the photo's motion, the third how
 * many moments the screen holds (a little, a lot, a great deal), the fourth how the scanner runs (steady, two scanners
 * crossed, reversing).  The walk changes one stage at a time and cross-fades; a new section changes all four.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> how many moments the screen holds: the slices thicken as the music swells
 *   audioPhase      -> the photo's motion (integrated)
 *   audioSectionId/Age -> a new section re-rolls every stage (a new scanner)
 *   voiceP          -> the voices' roles (voiceRoles(), plan 26.11.2026): kick, snare, hi-hat, melody, stereo,
 *                      build-up and bar phase each light a part of the picture of their own; 0 = as before
 *   depthLook 4     -> the subject anchor (plan M2, 26.11.2026): each photo is sampled shifted by its own
 *                      subject's offset from the centre (photoFocus; none without a sure subject), so the
 *                      lab's centre shows the subject; 0 = the old look
 *   depthLook 6     -> the anchor and frequency by depth (freqDepth(), plan P3, 27.11.2026): the bass brightens
 *                      the photo's near layer, the mids raise the colour of its middle layer, the highs set
 *                      fine round glints into its far layer; light and colour only; depthVar = its variant
 *
 * Knobs: seedP (the walk's seed), spanP (the base span of time on the screen), speedP (the photo's speed), hueP.
//@params seedP spanP speedP
//@audio audioSwell
//@depth
//@body
uniform float depthLook;   // 4: the subject anchor (plan M2) -- each photo is sampled around its own subject; 6: the anchor and frequency by depth (plan P3); 0: the old look
uniform float depthVar;    // the variant of look 6, 0..99: freqDepth()'s constants; 0 = the middle of every range
float gPhD = 0.0;   // the photo's depth at the look's photo lookup, 0 far .. 1 near (photoDepthLod)
/**  The scanner's moment at a place.
 *
 * @param kind  The scanner, 0..5: rows, columns, diagonal, radial, spiral, wavy rows. (in)
 * @param vi    The scanner's variant 0..99: its slope, scale and centre. (in)
 * @param p     The place. (in)
 *
 * @return
 *   The moment, about -1..1.
 **/
float stripMoment(int kind, int vi, vec2 p)
{
    if (kind == 0) return p.y * lv(vi, 1.0, 1.2, 2.8) + lv(vi, 2.0, -0.6, 0.6) * p.x;
    if (kind == 1) return p.x * lv(vi, 1.0, 0.7, 1.7) + lv(vi, 2.0, -0.6, 0.6) * p.y;
    if (kind == 2) return (p.x * lv(vi, 3.0, 0.2, 1.0) + p.y) * lv(vi, 1.0, 0.9, 1.9);
    vec2 c0 = vec2(lv(vi, 5.0, -0.3, 0.3), lv(vi, 6.0, -0.3, 0.3));
    float r = length(p - c0);
    if (kind == 3) return r * lv(vi, 1.0, 1.4, 3.4) + lv(vi, 4.0, -1.2, -0.4);
    if (kind == 4) return r * lv(vi, 1.0, 0.9, 2.3) + atan(p.y - c0.y, p.x - c0.x) / 6.2831853 * (2.0 + float(lk(vi, 7.0, 3))) + lv(vi, 8.0, -0.9, -0.1);
    return (p.y + lv(vi, 1.0, 0.06, 0.18) * sin(lv(vi, 2.0, 3.0, 9.0) * p.x)) * lv(vi, 3.0, 1.2, 2.8);
}

/**  Where the photo is read at a moment: the photo's motion.
 *
 * @param path  The motion, 0..4: circling pan, turn, breath, sway, Lissajous. (in)
 * @param vi    The motion's variant 0..99: its sizes and rates. (in)
 * @param p     The place. (in)
 * @param tm    The moment (clock plus the scanner's offset). (in)
 *
 * @return
 *   The place in the photo.
 **/
vec2 stripPath(int path, int vi, vec2 p, float tm)
{
    if (path == 0) return p + lv(vi, 1.0, 0.09, 0.27) * vec2(cos(lv(vi, 2.0, 0.25, 0.75) * tm), sin(lv(vi, 2.0, 0.25, 0.75) * tm));
    if (path == 1) return rot2(lv(vi, 1.0, 0.3, 0.9) * sin(lv(vi, 2.0, 0.25, 0.65) * tm)) * p;
    if (path == 2) return p * (1.0 + lv(vi, 1.0, 0.15, 0.55) * sin(lv(vi, 2.0, 0.25, 0.75) * tm));
    if (path == 3) return p + vec2(lv(vi, 1.0, 0.12, 0.38) * sin(lv(vi, 2.0, 0.4, 1.0) * tm), 0.0) + vec2(0.0, lv(vi, 3.0, 0.02, 0.08) * sin(lv(vi, 4.0, 0.8, 1.8) * tm));
    return p + lv(vi, 1.0, 0.1, 0.3) * vec2(sin(lv(vi, 2.0, 0.3, 0.9) * tm), sin(lv(vi, 3.0, 0.5, 1.3) * tm + lv(vi, 4.0, 0.0, 2.0)));
}

/**  One look of the lab.
 *
 * @param k    The classes: x the scanner, y the photo's motion, z the span of moments, w the scanner's run. (in)
 * @param kv   The variants of those classes (the constants of each). (in)
 * @param p    The place. (in)
 * @param t    The clock. (in)
 * @param sp   The base span. (in)
 * @param sw   The swell. (in)
 *
 * @return
 *   The colour.
 **/
vec3 stripLook(ivec4 k, ivec4 kv, vec2 p, float t, float sp, float sw)
{
    float span = sp * (k.z == 0 ? 2.0 : (k.z == 1 ? 4.5 : 8.0)) * lv(kv.z, 1.0, 0.7, 1.3) * (0.7 + 0.5 * sw);
    float m1 = stripMoment(k.x, kv.x, p);
    float m = m1;
    if (k.w == 1) m = mix(m1, stripMoment((k.x + 1) - 6 * ((k.x + 1) / 6), kv.x, p), lv(kv.w, 1.0, 0.3, 0.7));
    else if (k.w == 2) m = m1 * sin(lv(kv.w, 2.0, 0.06, 0.18) * t) + lv(kv.w, 3.0, -0.4, 0.4);
    vec2 q = stripPath(k.y, kv.y, p, t + span * m);
    vec2 puv = q * 0.8 + 0.5;
    float plod = 0.5;
    if (depthLook > 3.5) {   // the subject anchor (plan M2); without it the colour stays bit for bit
        vec4 aq = imgDepthOff(puv, anchorOff(photoFocus.xy, photoSubject.y, photoDepthAmt.x),
                              anchorOff(photoFocus.zw, photoSubject.w, photoDepthAmt.y), plod);
        gPhD = aq.w;
        return aq.rgb;
    }
    gPhD = photoDepthLod(puv, plod);   // the depth where the colour is taken (26.11.2026)
    return imgLod(puv, plod);
}

void main()
{
    vec2 p = screenP();
    labWalk(seedP * 83.0, ivec4(6, 5, 3, 3), 1.0);
    float sw = clamp(audioSwell, 0.0, 1.0);
    float sp = 0.5 + 0.9 * clamp(spanP, 0.0, 1.0);
    float t = (0.6 + 0.9 * clamp(speedP, 0.0, 1.0)) * (sceneTime * 0.6 + 4.0 * audioPhase);
    vec3 col = vec3(0.0);
    float ws = 0.0;
    float dsum = 0.0;   // the looks' photo depth, weighted like their colours
    for (int i = 0; i < 4; ++i) {
        if (gLabW[i] > 0.002) {
            col += gLabW[i] * stripLook(gLabK[i], gLabV[i], p, t, sp, sw);
            dsum += gLabW[i] * gPhD;
            ws += gLabW[i];
        }
    }
    float phD = dsum / max(ws, 1e-3);
    photoDepthOut(phD);
    col = max(col / max(ws, 1e-3), 0.0);
    if (depthLook > 5.5)   // look 6: the subject anchor and frequency by depth (plan P3, 27.11.2026)
        col = freqDepth(col, phD, screenP(), imgLod(screenP() * 0.5 + 0.5, 6.0), int(clamp(depthVar, 0.0, 99.0) + 0.5));
    finish(voiceRoles(col, screenP()));
}
