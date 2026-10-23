//@doc
 * @brief ROMANESCO CONE SPIRALS: the romanesco: cones in Fibonacci spirals, every cone itself made of cones; the photo sets the colour of the tips, and the spirals turn with the growth.  Points sit at the golden angle on a spreading disc, each is the tip of a cone shaded like a little pyramid, and the divergence
 * angle breathes a little round the golden angle so the arms of the spirals reorder slowly.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance     -> the growth: the whole turns (integrated)
 *   audioHarmAdvance -> the divergence angle breathes round the golden angle (integrated)
 *
 * Knobs: sizeP (the size of the cones), hueP.
//@params sizeP
//@audio audioAdvance audioHarmAdvance
//@body
void main()
{
    vec2 p = screenP();
    float cs = 0.028 + 0.022 * (1.0 - clamp(sizeP, 0.0, 1.0));
    float phi = 2.39996323 + 0.012 * sin(0.04 * audioHarmAdvance + 0.015 * sceneTime);
    float rot = 0.02 * audioAdvance + 0.015 * sceneTime;
    vec2 q = rot2(-rot) * p;
    float r = length(q);
    float n0 = (r / cs) * (r / cs);
    float dmin = 1e3;
    float bestn = 0.0;
    vec2 bestp = vec2(0.0);
    float lo = max(floor(n0) - 30.0, 0.0);
    for (int i = 0; i < 64; ++i) {
        float n = lo + float(i);
        float rr = cs * sqrt(n);
        float a = n * phi;
        vec2 pt = rr * vec2(cos(a), sin(a));
        float d = length(q - pt);
        if (d < dmin) { dmin = d; bestn = n; bestp = pt; }
    }
    float R = cs * 0.95;
    float cone = clamp(1.0 - dmin / R, 0.0, 1.0);
    vec2 lp = (q - bestp) / R;
    vec3 c = imgLod(rot2(rot) * bestp * 0.85 + 0.5, 1.5);
    c = mix(vec3(luma(c)), c, 1.4);
    float shade = 0.55 + 0.6 * clamp(dot(normalize(vec3(lp, 1.0 - dmin / R)), normalize(vec3(-0.4, 0.5, 0.8))), 0.0, 1.0);
    vec3 col = c * shade * (0.6 + 0.6 * cone) * 1.15 * smoothstep(0.0, 0.1, cone + 0.05);
    finish(col);
}
