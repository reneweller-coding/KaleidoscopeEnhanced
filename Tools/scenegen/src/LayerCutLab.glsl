//@doc
 * @brief LAYER CUT LAB: the photo cut into stacked sheets of paper by a rule -- its brightness (bright on top or dark on
 * top), its hue, its saturation, or the strength of its edges -- six to eleven layers, each its own cut-out of the
 * photo lying a little higher than the one below, so that parallax slides the layers against each other and every
 * layer throws a soft shadow on the next.  The second stage sets the number of layers, the third how the layers move
 * (drifting apart, breathing, circling at a phase that depends on their depth), the fourth the shadow (a soft drop
 * shadow, a long raking shadow, none but a lit bevel).  Every layer carries the photo's own colours.  The walk changes
 * one stage at a time and cross-fades; a new section changes all four.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the layers part: the parallax opens as the music swells
 *   audioSpread     -> how soft the cut edges are
 *   audioPhase      -> the layers' drift and circling (integrated)
 *   audioSectionId/Age -> a new section re-rolls every stage (a new cutting rule)
 *
 * Knobs: seedP (the walk's seed), partP (how far the layers part), edgeP (the base edge softness), hueP.
//@params seedP partP edgeP
//@audio audioSwell audioSpread
//@body
/**  The value the layers are cut by at a place.
 *
 * @param uv    The place in the photo. (in)
 * @param rule  The rule, 0..3: brightness, hue, saturation, edge strength. (in)
 * @param vi    The rule's variant 0..99: its offset, gain and scale. (in)
 *
 * @return
 *   The value, 0..1.
 **/
float layerRule(vec2 uv, int rule, int vi)
{
    vec3 c = imgLod(uv, lv(vi, 6.0, 2.4, 4.0));
    if (rule == 1) return fract(hue_of(c) + lv(vi, 3.0, -0.5, 0.5));
    if (rule == 2) return clamp(satOf(c) * lv(vi, 2.0, 0.6, 1.8), 0.0, 1.0);
    if (rule == 3) {
        float e = lv(vi, 4.0, 0.005, 0.015);
        vec2 g = vec2(luma(imgLod(uv + vec2(e, 0.0), 2.0)) - luma(imgLod(uv - vec2(e, 0.0), 2.0)),
                      luma(imgLod(uv + vec2(0.0, e), 2.0)) - luma(imgLod(uv - vec2(0.0, e), 2.0)));
        return clamp(length(g) * lv(vi, 5.0, 5.0, 13.0), 0.0, 1.0);
    }
    return clamp((luma(c) - lv(vi, 1.0, 0.0, 0.16)) * lv(vi, 2.0, 0.9, 1.5), 0.0, 1.0);
}

/**  One look of the lab.
 *
 * @param k    The classes: x the rule and polarity (0..7), y the number of layers, z the layers' motion, w the shadow. (in)
 * @param kv   The variants of those classes (the constants of each). (in)
 * @param p    The place. (in)
 * @param t    The clock. (in)
 * @param pt   How far the layers part. (in)
 * @param ed   The edge softness. (in)
 *
 * @return
 *   The colour.
 **/
vec3 layerLook(ivec4 k, ivec4 kv, vec2 p, float t, float pt, float ed)
{
    int rule = k.x - 4 * (k.x / 4);
    bool desc = k.x >= 4;
    int N = (k.y == 0 ? 6 : (k.y == 1 ? 8 : 11)) + lk(kv.y, 1.0, 3);
    vec2 uv0 = p * 0.8 + 0.5;
    vec3 col = imgLod(uv0, 0.4) * 0.8;
    float w = lv(kv.y, 2.0, 0.005, 0.075) + lv(kv.y, 3.0, 0.02, 0.22) * ed;
    float sa = lv(kv.w, 1.0, -0.8, 0.8);
    vec2 ldir = rot2(sa) * (k.w == 1 ? vec2(0.8, -0.35) : vec2(0.45, -0.55));
    float sh = k.w == 1 ? lv(kv.w, 2.0, 0.02, 0.05) : lv(kv.w, 3.0, 0.007, 0.021);
    for (int i = 1; i < 14; ++i) {
        if (i >= N) break;
        float fi = float(i) / float(N);
        float depth = fi - 0.5;
        vec2 o;
        if (k.z == 0) o = pt * lv(kv.z, 1.0, 0.025, 0.075) * depth * vec2(cos(lv(kv.z, 2.0, 0.1, 0.3) * t), sin(lv(kv.z, 2.0, 0.1, 0.3) * t));
        else if (k.z == 1) o = pt * lv(kv.z, 3.0, 0.03, 0.09) * depth * vec2(sin(lv(kv.z, 5.0, 0.15, 0.45) * t), lv(kv.z, 4.0, 0.0, 1.0) * sin(lv(kv.z, 5.0, 0.15, 0.45) * t));
        else o = pt * lv(kv.z, 6.0, 0.02, 0.07) * vec2(cos(lv(kv.z, 7.0, 0.12, 0.38) * t + lv(kv.z, 8.0, 1.5, 4.5) * fi), sin(lv(kv.z, 7.0, 0.12, 0.38) * t + lv(kv.z, 8.0, 1.5, 4.5) * fi)) * (lv(kv.z, 9.0, 0.2, 0.6) + fi);
        vec2 uv = uv0 + o;
        float r = layerRule(uv, rule, kv.x);
        r = desc ? 1.0 - r : r;
        float th = fi;
        float m = smoothstep(th - w, th + w, r);
        float ms = smoothstep(th - w, th + w, (desc ? 1.0 - layerRule(uv - ldir * sh, rule, kv.x) : layerRule(uv - ldir * sh, rule, kv.x)));
        if (k.w == 2) {
            float bevel = clamp((m - ms) * lv(kv.w, 4.0, 1.8, 4.2), -1.0, 1.0);
            col = mix(col, imgLod(uv, 0.4), m) * (1.0 + lv(kv.w, 5.0, 0.12, 0.38) * bevel);
        } else {
            col = mix(col * (1.0 - lv(kv.w, 6.0, 0.3, 0.7) * ms * (1.0 - m)), imgLod(uv, 0.4), m);
        }
    }
    return col * 1.2;
}

void main()
{
    vec2 p = screenP();
    labWalk(seedP * 83.0, ivec4(8, 3, 3, 3), 1.0);
    float sw = clamp(audioSwell, 0.0, 1.0);
    float pt = (0.5 + 0.9 * clamp(partP, 0.0, 1.0)) * (0.5 + 1.0 * sw);
    float ed = clamp(0.3 * clamp(edgeP, 0.0, 1.0) + 0.5 * clamp(audioSpread, 0.0, 1.0), 0.0, 1.0);
    float t = sceneTime * 0.6 + 4.0 * audioPhase;
    vec3 col = vec3(0.0);
    float ws = 0.0;
    for (int i = 0; i < 4; ++i) {
        if (gLabW[i] > 0.002) {
            col += gLabW[i] * layerLook(gLabK[i], gLabV[i], p, t, pt, ed);
            ws += gLabW[i];
        }
    }
    finish(max(col / max(ws, 1e-3), 0.0));
}
