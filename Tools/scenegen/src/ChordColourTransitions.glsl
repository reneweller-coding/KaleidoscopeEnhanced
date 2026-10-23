//@doc
 * @brief CHORD COLOUR TRANSITIONS: a chord diagram of colours: the hues of the photo sit on a circle, and ribbons join two hues that lie next to each other in the photo; the more often a transition occurs the broader the ribbon.  The photo lies dimmed behind,
 * the ribbons are in its colours.  Eighteen pairs of places of the photo wander slowly, and so do the ribbons that belong to them.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the circle turns (integrated)
 *   audioSwell   -> the width of the ribbons
 *
 * Knobs: sizeP (the radius of the circle), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
/**  The hue of a colour as a number 0..1 (the angle in the chroma plane).
 *
 * @param c  The colour. (in)
 *
 * @return
 *   The hue.
 **/
float hueA(vec3 c)
{
    return atan(1.7320508 * (c.g - c.b), 2.0 * c.r - c.g - c.b) / 6.2831853 + 0.5;
}
void main()
{
    vec2 p = screenP();
    float R = 0.36 + 0.12 * clamp(sizeP, 0.0, 1.0);
    float rot = 0.04 * audioAdvance + 0.03 * sceneTime;
    vec3 col = imgLod(p * 0.85 + 0.5, 2.0) * 0.3;
    float r = length(p);
    float a = atan(p.y, p.x) - rot;
    float ringm = smoothstep(R - 0.006, R, r) * (1.0 - smoothstep(R + 0.02, R + 0.026, r));
    float sec = fract(a / 6.2831853 * 12.0);
    vec3 ringc = hsv2rgb(vec3(fract(a / 6.2831853 + 0.5), 0.7, 0.95)) * (0.5 + 0.5 * smoothstep(0.0, 0.08, sec) * (1.0 - smoothstep(0.92, 1.0, sec)));
    col = mix(col, ringc, ringm);
    float sw = 0.6 + 0.8 * clamp(audioSwell, 0.0, 1.0);
    for (int k = 0; k < 18; ++k) {
        float fk = float(k);
        vec2 h = hash22(vec2(fk, 1.3));
        vec2 pa = 0.5 + 0.38 * sin(h * 6.2831853 + 0.07 * sceneTime * (0.6 + h.yx));
        vec2 pb = pa + 0.06 * vec2(cos(6.2831853 * h.x * 3.0), sin(6.2831853 * h.y * 3.0));
        vec3 ca = imgLod(pa, 2.5);
        vec3 cb = imgLod(pb, 2.5);
        float t1 = 6.2831853 * hueA(ca) + rot - 3.1415927;
        float t2 = 6.2831853 * hueA(cb) + rot - 3.1415927;
        vec2 P1 = R * vec2(cos(t1), sin(t1));
        vec2 P2 = R * vec2(cos(t2), sin(t2));
        vec2 C = 0.12 * (P1 + P2);
        float w = (0.006 + 0.016 * h.x + 0.012 * luma(ca)) * sw;
        float dmin = 1e3;
        float sbest = 0.0;
        vec2 q0 = P1;
        for (int i = 1; i <= 12; ++i) {
            float s = float(i) / 12.0;
            vec2 q1 = (1.0 - s) * (1.0 - s) * P1 + 2.0 * s * (1.0 - s) * C + s * s * P2;
            float d = sdSeg(p, q0, q1);
            if (d < dmin) { dmin = d; sbest = s; }
            q0 = q1;
        }
        float al = 1.0 - smoothstep(w * 0.5, w, dmin);
        vec3 cr = mix(ca, cb, sbest);
        cr = mix(vec3(luma(cr)), cr, 1.7);
        col = mix(col, cr * 1.3, al * 0.8);
    }
    finish(col * 1.1);
}
