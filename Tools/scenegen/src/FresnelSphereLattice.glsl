//@doc
 * @brief FRESNEL SPHERE LATTICE: spheres of a densest packing -- the face-centred cubic lattice -- seen as glass,
 * only their rims glowing, the way a soap bubble shows its edge; the eye glides through the gaps between them.  The
 * rays pass through every sphere and gather light where they skim a surface, so each sphere is a ring of light with
 * a dark heart.  The nearest centre is found by rounding to the lattice D3.  One colour family from the photo, a
 * shade per sphere.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the spheres' radius breathes
 *   audioKick    -> a quarter of the spheres flash their rims (light)
 *   audioAdvance -> the glide (integrated)
 *
 * Knobs: radiusP (the spheres' base radius), rimP (how thin the rims), hueP.
//@params radiusP rimP
//@audio audioSwell audioKick
//@body
/**  The nearest point of the face-centred cubic lattice (cube edge 1): round to the integer lattice at half steps,
 * and if the sum is odd, round the coordinate that was furthest off the other way.
 *
 * @param x  The point. (in)
 *
 * @return
 *   The nearest lattice point.
 **/
vec3 fccNearest(vec3 x)
{
    vec3 q = 2.0 * x;
    vec3 f = floor(q + 0.5);
    if (mod(f.x + f.y + f.z, 2.0) > 0.5) {
        vec3 e = q - f;
        vec3 a = abs(e);
        if (a.x >= a.y && a.x >= a.z) f.x += e.x >= 0.0 ? 1.0 : -1.0;
        else if (a.y >= a.z) f.y += e.y >= 0.0 ? 1.0 : -1.0;
        else f.z += e.z >= 0.0 ? 1.0 : -1.0;
    }
    return 0.5 * f;
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    const float S = 2.6;
    float rad = S * (0.2 + 0.05 * clamp(radiusP, 0.0, 1.0)) * (0.92 + 0.14 * clamp(audioSwell, 0.0, 1.0));
    float rim = 0.012 + 0.018 * (1.0 - clamp(rimP, 0.0, 1.0));
    float kick = clamp(audioKick, 0.0, 1.0);
    float glide = 0.3 * sceneTime + 1.3 * audioAdvance;
    vec3 ro = vec3(S * 0.25 + 0.15 * sin(0.06 * glide), S * 0.25 + 0.15 * cos(0.05 * glide), glide);
    vec3 rd = normalize(vec3(p, 1.1));
    rd.xz = rot2(0.35 * sin(0.023 * sceneTime)) * rd.xz;
    rd.yz = rot2(0.25 * sin(0.019 * sceneTime + 2.0)) * rd.yz;
    rd.xy = rot2(0.015 * sceneTime) * rd.xy;
    vec3 col = vec3(0.0);
    float t = 0.05;
    for (int i = 0; i < 100; ++i) {
        vec3 x = ro + rd * t;
        vec3 c = fccNearest(x / S) * S;
        float d = length(x - c) - rad;
        float hc = fract(sin(dot(c, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        float g = exp(-pow(d / rim, 2.0));
        float flash = 1.0 + 2.5 * kick * step(0.75, hc);
        vec3 photo = imgLod(c.xy * 0.07 + 0.5 + 0.05 * c.z, 3.0);
        vec3 tone = famLight(fh, 0.15 + 0.7 * luma(photo), 0.15 + 0.2 * kick * step(0.75, hc));
        float fade = exp(-0.17 * t) * smoothstep(0.1, 0.8, t);
        float stepLen = clamp(abs(d) * 0.6, 0.012, 0.4);
        col += tone * g * flash * fade * min(stepLen, 0.05) * 4.0;
        t += stepLen;
        if (t > 30.0) break;
    }
    col += famCol(fh, 0.5) * 0.012;
    finish(col);
}
