//@doc
 * @brief PIGMENT NEBULA KALEIDO: a volumetric kaleidoscope of coloured nebula: clouds of pigment are mirrored in space
 * round the line of flight, so they form a three-dimensional rosette that the view flies through; the number of mirrors
 * changes with the chords, the old rosette melting into the new.  Every step of the ray folds its point round the axis
 * into one mirrored sector (two sector counts, their densities blended by the harmony), then reads a three-dimensional
 * noise there as the cloud's density; the cloud glows and absorbs, its colour taken from the photo at the folded
 * place.  The colours are the photo's, calmed into one colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance     -> the flight (integrated)
 *   audioHarmAdvance -> the number of mirrors changes with the chords (blended)
 *   audioSwell       -> the nebula's glow
 *
 * Knobs: foldP (the base number of mirrors), densP (how dense the nebula is), hueP.
//@params foldP densP
//@audio audioHarmAdvance audioSwell
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

/**  Three-dimensional value noise.
 *
 * @param x  The place. (in)
 *
 * @return
 *   The noise, 0..1.
 **/
float noise3(vec3 x)
{
    vec3 i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    float n = dot(i, vec3(1.0, 57.0, 113.0));
    vec4 a = fract(sin(vec4(n, n + 1.0, n + 57.0, n + 58.0)) * 43758.5453);
    vec4 b = fract(sin(vec4(n + 113.0, n + 114.0, n + 170.0, n + 171.0)) * 43758.5453);
    vec4 l = mix(a, b, f.z);
    vec2 m = mix(l.xz, l.yw, f.x);
    return mix(m.x, m.y, f.y);
}

/**  The cloud's density at a point folded into one sector.
 *
 * @param x  The point. (in)
 * @param n  The number of mirror sectors round the axis. (in)
 *
 * @return
 *   The density (xy of the folded point in zw for the colour lookup).
 **/
vec4 cloud(vec3 x, float n)
{
    float sec = 6.2831853 / n;
    float a = abs(mod(atan(x.y, x.x), sec) - 0.5 * sec);
    vec3 q = vec3(length(x.xy) * vec2(cos(a), sin(a)), x.z);
    float d = 0.5 * noise3(q * 2.0) + 0.25 * noise3(q * 4.1 + 3.0) + 0.125 * noise3(q * 8.3 + 7.0);
    return vec4(d, 0.0, q.xy);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float n0 = 4.0 + floor(3.0 * clamp(foldP, 0.0, 1.0));
    float dens = 0.8 + 1.2 * clamp(densP, 0.0, 1.0);
    float h = max(audioHarmAdvance, 0.0);
    float hk = floor(h), hm = smoothstep(0.15, 0.85, h - hk);
    float nA = n0 + mod(hk, 3.0), nB = n0 + mod(hk + 1.0, 3.0);
    float fly = 0.12 * sceneTime + 0.45 * audioAdvance;
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec3 ro = vec3(0.0, 0.0, fly);
    vec3 rd = normalize(vec3(p, 1.2));
    vec3 col = vec3(0.0);
    float tr = 1.0, t = 0.1;
    for (int i = 0; i < 44; ++i) {
        vec3 x = ro + rd * t;
        x.xy = rot2(0.1 * x.z) * x.xy;
        vec4 ca = cloud(x, nA), cb = cloud(x, nB);
        float d = (1.0 - hm) * ca.x + hm * cb.x;
        vec2 uq = (1.0 - hm) * ca.zw + hm * cb.zw;
        float rho = max(d - 0.47, 0.0) * dens * 1.6;
        vec3 c = tone(imgLod(fract(uq * 0.35 + 0.5 + 0.05 * x.z), 2.5), fh);
        col += tr * c * rho * 0.6 * glow;
        tr *= exp(-rho * 0.45);
        t += 0.09;
        if (tr < 0.03) break;
    }
    col += famCol(fh, 0.45) * 0.02 * tr;
    finish(col);
}
