//@doc
 * @brief PIXEL SORT CASCADE: pixel sorting -- along every line of the picture, each run of pixels whose brightness lies
 * between two thresholds is sorted from dark to light, so the photo pours out into streams of graded colour between
 * the parts left standing.  Neighbouring bands of lines sort opposite ways, mirror-wise; the lines' direction turns
 * slowly and the photo drifts along them, so the streams keep flowing.
 *
 * Audio Reactivity (structure, not only light):
 *   audioLevel      -> the lower threshold (louder: more of the picture melts into streams)
 *   audioRolloff    -> the upper threshold
 *   audioPhase      -> the lines' direction turns (integrated)
 *   audioAdvance    -> the photo drifts along the lines (integrated)
 *
 * Knobs: spanP (how far a run may reach), bandP (the mirror bands' width), photoP (photo share), hueP.
//@params spanP bandP photoP
//@audio audioRolloff
//@body
void main()
{
    vec2 p = screenP();
    float th = 0.35 * sin(0.013 * sceneTime) + 0.004 * audioPhase;
    mat2 R = rot2(th);
    vec2 q = R * p;                                             // q.x along the lines, q.y across
    float bandW = 0.04 + 0.12 * clamp(bandP, 0.0, 1.0);
    float band = floor(q.y / bandW);
    float dir = mod(band, 2.0) < 0.5 ? 1.0 : -1.0;              // neighbouring bands sort opposite ways
    vec2 drift = vec2(0.02 * sceneTime + 0.03 * audioAdvance, 0.0) * dir;
    float lo = 0.04 + 0.18 * (1.0 - clamp(audioLevel, 0.0, 1.0));
    float hi = 0.72 + 0.26 * clamp(audioRolloff, 0.0, 1.0);
    float stepL = 0.006;
    int reach = int(16.0 + 32.0 * clamp(spanP, 0.0, 1.0));
    mat2 Ri = rot2(-th);
    // the run: how far the band of brightness reaches back and forth along the line
    float sBack = 0.0, sFwd = 0.0;
    float l0 = luma(imgLod(0.5 + 0.5 * (Ri * (q + drift)), 1.0));
    bool inRun = l0 > lo && l0 < hi;
    vec3 col = imgLod(0.5 + 0.5 * (Ri * (q + drift)), 0.0);
    if (inRun) {
        for (int i = 1; i < 48; ++i) {
            if (i > reach) break;
            float l = luma(imgLod(0.5 + 0.5 * (Ri * (q + drift - vec2(stepL * float(i), 0.0))), 1.0));
            if (l <= lo || l >= hi) break;
            sBack = stepL * float(i);
        }
        for (int i = 1; i < 48; ++i) {
            if (i > reach) break;
            float l = luma(imgLod(0.5 + 0.5 * (Ri * (q + drift + vec2(stepL * float(i), 0.0))), 1.0));
            if (l <= lo || l >= hi) break;
            sFwd = stepL * float(i);
        }
        float len = sBack + sFwd;
        if (len > 2.0 * stepL) {
            // sample the run, sort the samples by brightness, read the sorted run where this pixel stands
            vec3 cs[12];
            float ls[12];
            for (int k = 0; k < 12; ++k) {
                float s = -sBack + len * (float(k) + 0.5) / 12.0;
                cs[k] = imgLod(0.5 + 0.5 * (Ri * (q + drift + vec2(s, 0.0))), 0.5);
                ls[k] = luma(cs[k]);
            }
            for (int a = 1; a < 12; ++a) {
                for (int b = a; b > 0; --b) {
                    if (ls[b - 1] <= ls[b]) break;
                    float tl = ls[b]; ls[b] = ls[b - 1]; ls[b - 1] = tl;
                    vec3 tc = cs[b]; cs[b] = cs[b - 1]; cs[b - 1] = tc;
                }
            }
            float t = sBack / len;
            if (dir < 0.0) t = 1.0 - t;
            float fi = clamp(t * 11.0, 0.0, 11.0);
            int i0 = int(floor(fi));
            int i1 = min(i0 + 1, 11);
            col = mix(cs[i0], cs[i1], fract(fi));
        }
    }
    vec3 tone = imgPalette(0.3 + 0.03 * audioPhase);
    col = mix(col * tone * 1.7, col, 0.6 + 0.4 * clamp(photoP, 0.0, 1.0));
    finish(col * 1.05);
}
