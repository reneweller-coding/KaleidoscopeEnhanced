//@doc
 * @brief GLASS SHADOW CAUSTICS: a floor seen from above, crowded with coloured glass vessels whose shadows and caustics
 * cover it all: each vessel throws a long tinted shadow away from each light, with a bright caustic gathered inside it
 * where the curved glass focuses the light; the lights circle round, so the shadows sweep and overlap, their tints
 * mixing.  A vessel is a circle on the floor (its rim seen from above); its shadow from a light is a capsule reaching
 * away from the light, tinted by the glass and lit by a focused spot and two bright cusp lines meeting two thirds out.
 * The number of lights follows the chord's notes.  The glass is shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the lights circle (integrated)
 *   audioChroma[12] -> the number of lights: one for each strongly sounding note (each fades in and out)
 *   audioSwell      -> the caustics' brightness
 *
 * Knobs: vesselP (how many vessels), lengthP (how long the shadows are), hueP.
//@params vesselP lengthP
//@audio audioChroma[12] audioSwell
//@body
/**  The photo's colour calmed toward the colour family.
 *
 * @param photo  The photo's colour. (in)
 * @param fh     The family's hue. (in)
 *
 * @return
 *   The colour.
 **/
vec3 tone(vec3 photo, float fh)
{
    float l = luma(photo);
    return mix(photo * 1.1, famCol(fh, 0.15 + 0.7 * l) * (0.25 + 1.2 * l), 0.45);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float NV = floor(7.0 + 5.0 * clamp(vesselP, 0.0, 1.0));
    float run = 0.03 * sceneTime + 0.12 * audioAdvance;
    float caustB = 0.6 + 0.7 * clamp(audioSwell, 0.0, 1.0);
    float nl = 0.0;
    for (int k = 0; k < 12; ++k) nl += smoothstep(0.45, 0.75, audioChroma[k]);
    nl = clamp(nl, 1.0, 4.0);
    vec3 col = tone(imgLod(p * 0.5 + 0.5, 6.0), fh) * 0.06;
    for (int L = 0; L < 4; ++L) {
        float fL = float(L);
        float wL = clamp(nl - fL, 0.0, 1.0);
        if (wL <= 0.0) break;
        vec2 lp = vec2(1.0 * cos(run * (1.0 + 0.2 * fL) + 1.5708 * fL), 0.6 * sin(run * (1.0 + 0.2 * fL) + 1.5708 * fL));
        vec3 lc = famLight(fh, 0.5 + 0.1 * fL, 0.85);
        vec3 lit = vec3(1.0);
        vec3 caus = vec3(0.0);
        for (int v = 0; v < 12; ++v) {
            float fv = float(v);
            if (fv >= NV) break;
            float h1 = fract(sin(fv * 12.9898) * 43758.5453), h2 = fract(sin(fv * 78.233) * 43758.5453);
            vec2 c = vec2(1.6 * (fract(fv * 0.7548777 + 0.1) - 0.5), 0.9 * (fract(fv * 0.5698403 + 0.3) - 0.5));   // the R2 sequence
            c += 0.06 * vec2(sin(0.2 * run + 6.0 * h1), cos(0.17 * run + 6.0 * h2));
            float r = 0.05 + 0.04 * h2;
            vec2 away = c - lp;
            float dl = length(away);
            vec2 ad = away / dl;
            float len = (0.2 + 0.25 * clamp(lengthP, 0.0, 1.0)) * (0.5 + dl);   // longer farther from the light
            vec2 rel = p - c;
            float s = clamp(dot(rel, ad) / len, 0.0, 1.0);
            float dist = length(rel - ad * len * s);
            float inS = smoothstep(r * 1.05, r * 0.8, dist);
            vec3 tint = famCol(fh, h1);
            lit *= mix(vec3(1.0), tint * 0.5, inS);
            float across = dot(rel, vec2(-ad.y, ad.x)) / r;
            float spot = exp(-pow((s - 0.62) / 0.1, 2.0)) * exp(-pow(across / 0.3, 2.0));
            float cusp = exp(-pow((abs(across) - 0.8 * (0.62 - s) / 0.62) / 0.08, 2.0)) * smoothstep(0.05, 0.3, s) * smoothstep(0.66, 0.55, s);
            caus += mix(tint, vec3(1.0), 0.5) * (spot * 1.3 + cusp * 0.5) * inS;
        }
        float fall = 1.3 / (1.0 + 1.5 * dot(p - lp, p - lp));
        col += wL * lc * (lit * fall * 0.6 + caus * caustB * fall);
    }
    // the vessels themselves, seen from above: glass discs with bright rims
    for (int v = 0; v < 12; ++v) {
        float fv = float(v);
        if (fv >= NV) break;
        float h1 = fract(sin(fv * 12.9898) * 43758.5453), h2 = fract(sin(fv * 78.233) * 43758.5453);
        vec2 c = vec2(1.6 * (fract(fv * 0.7548777 + 0.1) - 0.5), 0.9 * (fract(fv * 0.5698403 + 0.3) - 0.5));
        c += 0.06 * vec2(sin(0.2 * run + 6.0 * h1), cos(0.17 * run + 6.0 * h2));
        float r = 0.05 + 0.04 * h2;
        float dv = length(p - c);
        col = mix(col, col * famCol(fh, h1) * 1.2 + famCol(fh, h1) * 0.08, smoothstep(r, r * 0.92, dv) * 0.7);
        col += famLight(fh, h1, 0.8) * exp(-pow((dv - r) / 0.004, 2.0)) * 0.5;
    }
    finish(col);
}
