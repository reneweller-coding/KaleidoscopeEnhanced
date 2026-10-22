//@doc
 * @brief SUPERSHAPE LANTERNS: lanterns of Gielis' superformula, endlessly tiled in the dark -- translucent shells
 * whose form breathes between star, blossom and cushion, lit from within; the eye floats down an aisle between
 * them.  A lantern is the spherical product of two superformulas, r1(theta) round its waist and r2(phi) from pole
 * to pole; its skin is the photo, shone through, in one colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> each chord change glides every lantern's symmetry number (3, 5, 6, 8, 4, 7 lobes);
 *                       the superformula stays seamless at broken numbers, so the lobes grow and part smoothly
 *   audioSwell       -> the shells swell from star toward cushion
 *   audioAdvance     -> the float down the aisle and the lanterns' slow turning (integrated)
 *   audioOnset       -> the inner light flickers up
 *
 * Knobs: lobeP (the lanterns' base sharpness), skinP (how strongly the photo shows), hueP.
//@params lobeP skinP
//@audio audioHarmAdvance audioSwell audioOnset
//@body
/**  The superformula.
 *
 * @param a   The angle. (in)
 * @param m   The symmetry number. (in)
 * @param n1  The overall exponent (small: star, large: cushion). (in)
 * @param n2  The cosine term's exponent. (in)
 * @param n3  The sine term's exponent. (in)
 *
 * @return
 *   The radius.
 **/
float superF(float a, float m, float n1, float n2, float n3)
{
    float c = pow(abs(cos(0.25 * m * a)), n2), s = pow(abs(sin(0.25 * m * a)), n3);
    return pow(max(c + s, 1e-4), -1.0 / n1);
}

/**  The symmetry number of a step in the cycle 3, 5, 6, 8, 4, 7.
 *
 * @param k  The step. (in)
 *
 * @return
 *   The number of lobes.
 **/
float lobeCount(float k)
{
    float m = mod(k, 6.0);
    return m < 0.5 ? 3.0 : m < 1.5 ? 5.0 : m < 2.5 ? 6.0 : m < 3.5 ? 8.0 : m < 4.5 ? 4.0 : 7.0;
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    const float CELL = 3.4;
    float h = max(audioHarmAdvance, 0.0);
    float hk = floor(h), hm = smoothstep(0.15, 0.85, h - hk);
    float m = mix(lobeCount(hk), lobeCount(hk + 1.0), hm);
    float sw = clamp(audioSwell, 0.0, 1.0);
    float skin = 0.4 + 0.6 * clamp(skinP, 0.0, 1.0);
    float glide = 0.28 * sceneTime + 1.2 * audioAdvance;
    float spin = 0.05 * sceneTime + 0.3 * audioAdvance;
    float inner = 0.6 + 0.9 * clamp(audioOnset, 0.0, 1.0);
    vec3 ro = vec3(0.5 * CELL + 0.3 * sin(0.05 * glide), 0.5 * CELL + 0.25 * cos(0.04 * glide), glide);
    vec3 rd = normalize(vec3(p, 1.15));
    rd.xz = rot2(0.4 * sin(0.022 * sceneTime)) * rd.xz;
    rd.yz = rot2(0.25 * sin(0.018 * sceneTime + 1.0)) * rd.yz;
    vec3 col = vec3(0.0);
    float t = 0.05;
    for (int i = 0; i < 90; ++i) {
        vec3 x = ro + rd * t;
        vec3 cid = floor(x / CELL);
        vec3 q = x - (cid + 0.5) * CELL;
        float hc = fract(sin(dot(cid, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        q.xy = rot2(spin * (0.6 + 0.8 * hc) + 6.2831853 * hc) * q.xy;
        q.yz = rot2(0.6 * hc - 0.3) * q.yz;
        // the shape: per lantern a place between star and cushion, the swell pushes toward the cushion
        float w = clamp(0.25 * clamp(lobeP, 0.0, 1.0) + 0.5 * hc + 0.45 * sw - 0.1, 0.0, 1.0);
        float n1 = mix(0.35, 2.2, w), n23 = mix(0.6, 1.7, w);
        float r = length(q);
        float th = atan(q.y, q.x);
        float ph = asin(clamp(q.z / max(r, 1e-4), -1.0, 1.0));
        float r1 = superF(th, m, n1, n23, n23);
        float r2 = superF(ph, 4.0, 1.4, 1.2, 1.2);
        float R = 0.95 * r2 * length(vec2(r1 * cos(ph), sin(ph)));
        float d = (r - R) * 0.6;
        vec3 photo = imgLod(vec2(abs(th) / 3.1415927, ph / 3.1415927 + 0.5) * 0.8 + 0.1 * hc, 1.5);
        vec3 tone = famLight(fh, 0.2 + 0.6 * mix(0.5, luma(photo), skin), 0.15);
        float sk = exp(-pow(d / 0.018, 2.0));                     // the skin, shone through
        float fade = exp(-0.11 * t) * smoothstep(0.3, 1.2, t);
        col += tone * sk * (0.3 + 0.7 * skin * luma(photo) * 1.6) * fade * 0.14;
        if (d < 0.0) col += famLight(fh, 0.6, 0.45) * inner * exp(-2.5 * r / max(R, 0.2)) * fade * 0.03;
        vec3 wall = (0.5 * CELL - abs(x - (cid + 0.5) * CELL)) / max(abs(rd), 1e-3);
        t += clamp(max(abs(d) * 0.6, 0.02), 0.02, min(wall.x, min(wall.y, wall.z)) + 0.02);
        if (t > 30.0) break;
    }
    col += famCol(fh, 0.5) * 0.012;
    finish(col);
}
