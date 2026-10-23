//@doc
 * @brief BARNSLEY FERN PHOTO FRONDS: Barnsley's fern: a frond made of smaller ferns, whose growth wanders slowly; the photo colours the leaflets, and the coefficients glide between frond shapes.  Three fronds on a ring, each a curved stem with sixteen pairs of leaflets that get shorter towards the tip; the curvature of the stem
 * follows the key.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the curvature of the fronds glides (integrated)
 *   audioAdvance     -> the fronds turn slowly (integrated)
 *
 * Knobs: sizeP (the length of the fronds), hueP.
//@params sizeP
//@audio audioAdvance audioHarmAdvance
//@body
void main()
{
    vec2 p = screenP();
    vec3 col = imgLod(p * 0.85 + 0.5, 2.0) * 0.2;
    float curv = 0.5 + 0.45 * sin(0.05 * audioHarmAdvance + 0.02 * sceneTime);
    float L0 = 0.55 + 0.25 * clamp(sizeP, 0.0, 1.0);
    for (int f = 0; f < 3; ++f) {
        float ff = float(f);
        float rot = 6.2831853 * ff / 3.0 + 0.015 * audioAdvance + 0.02 * sceneTime;
        vec2 q = rot2(-rot) * p + vec2(0.0, 0.0);
        q.y += 0.02;
        float dmin = 1e3;
        float sBest = 0.0;
        vec2 prev = vec2(0.0);
        for (int i = 1; i <= 16; ++i) {
            float s = float(i) / 16.0;
            float s0 = float(i - 1) / 16.0;
            float ang0 = 1.5707963 + curv * 1.8 * s0 * s0;
            float ang1 = 1.5707963 + curv * 1.8 * s * s;
            vec2 a0 = vec2(0.0);
            vec2 pt0 = (i == 1) ? vec2(0.0) : prev;
            vec2 step_ = L0 / 16.0 * vec2(cos(ang1), sin(ang1));
            vec2 pt1 = pt0 + step_;
            float dst = sdSeg(q, pt0, pt1);
            if (dst < dmin) { dmin = dst; sBest = s; }
            float ll = L0 * 0.32 * pow(1.0 - s, 0.8) * (0.4 + 0.6 * sin(3.1415927 * (0.15 + 0.85 * s)));
            for (int sd = -1; sd <= 1; sd += 2) {
                float la = ang1 + float(sd) * (1.0 + 0.2 * curv);
                vec2 e = pt1 + ll * vec2(cos(la), sin(la));
                float dl = sdSeg(q, pt1, e);
                if (dl < dmin) { dmin = dl; sBest = s; }
            }
            prev = pt1;
        }
        float line = 1.0 - smoothstep(0.003, 0.008, dmin);
        vec3 c = imgLod(rot2(rot) * q * 0.85 + 0.5, 1.0);
        c = mix(vec3(luma(c)), c, 1.5);
        col = mix(col, c * (1.0 + 0.5 * (1.0 - sBest)) * 1.4 + 0.1, line);
    }
    finish(col);
}
