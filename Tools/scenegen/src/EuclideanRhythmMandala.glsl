//@doc
 * @brief EUCLIDEAN RHYTHM MANDALA: a field of mandalas made of rhythms -- every mandala is a set of concentric rings of
 * round beads, each ring a Euclidean rhythm (k hits spread as evenly as possible over n steps, the pattern behind
 * the tresillo, the cinquillo and countless others), the hits lit, the rests dim.  The rings turn against each
 * other, a step per beat or per bar, and the denser the music's onsets, the more hits every ring holds.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBeatPhase  -> the rings turn on the beat (the beats counted on the state pass: continuous)
 *   audioOnset      -> the onsets' density (smoothed on the state pass) sets how many hits each ring holds
 *   audioKick       -> the hits flash (light)
 *
 * Knobs: ringsP (rings per mandala), sizeP (the mandalas' size), photoP (photo share), hueP.
//@params ringsP sizeP photoP
//@audio audioBeatPhase audioOnset audioKick
//@state 2 1 120
//@body
/**  The state pass: texel 0 counts the beats (wraps of the beat phase), texel 1 smooths the onset density.
 *
 * @return
 *   Texel 0: the beats (r), the last beat phase (g); texel 1: the smoothed onset density (r).
 **/
vec4 stateStep()
{
    int i = int(gl_FragCoord.x);
    if (stateFrame < 0.5) return i == 0 ? vec4(0.0, audioBeatPhase, 0.0, 1.0) : vec4(0.4, 0.0, 0.0, 1.0);
    vec4 c = texelFetch(texState, ivec2(i, 0), 0);
    if (i == 0) return vec4(c.r + (audioBeatPhase < c.g - 0.5 ? 1.0 : 0.0), audioBeatPhase, 0.0, 1.0);
    return vec4(mix(c.r, clamp(audioOnset * 1.5, 0.0, 1.0), 0.004), 0.0, 0.0, 1.0);   // over a couple of seconds
}

/**  Whether step s of a Euclidean rhythm E(k, n) is a hit (Bjorklund's pattern by the floor formula).
 *
 * @param s  The step. (in)
 * @param k  The hits. (in)
 * @param n  The steps. (in)
 *
 * @return
 *   1 for a hit, 0 for a rest.
 **/
float euclidHit(float s, float k, float n)
{
    return floor((s + 1.0) * k / n) - floor(s * k / n) > 0.5 ? 1.0 : 0.0;
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    vec4 b = texelFetch(texState, ivec2(0, 0), 0);
    float beats = b.r + clamp(audioBeatPhase, 0.0, 1.0);
    float dens = texelFetch(texState, ivec2(1, 0), 0).r;
    float S = 0.55 + 0.25 * clamp(sizeP, 0.0, 1.0);
    // a hexagonal field of mandalas
    vec2 a = vec2(1.0, 1.7320508) * S;
    vec2 h1 = mod(p, a) - 0.5 * a, h2 = mod(p - 0.5 * a, a) - 0.5 * a;
    vec2 loc = dot(h1, h1) < dot(h2, h2) ? h1 : h2;
    vec2 id = floor((p - loc) / (0.5 * S) + 0.5);
    float hm = hash21(id);
    int nr = int(3.0 + 3.99 * clamp(ringsP, 0.0, 1.0));
    float r = length(loc) / S, ang = atan(loc.y, loc.x);
    vec3 tone = imgPalette(0.3 + 0.03 * audioPhase);
    vec3 col = imgLod(p * 0.3 + 0.5, 5.0) * 0.1;
    for (int j = 0; j < 7; ++j) {
        if (j >= nr) break;
        float fj = float(j);
        float rr = 0.12 + 0.36 * (fj + 0.5) / float(nr);
        float n = 5.0 + floor(11.0 * hash11(hm * 13.0 + fj * 3.1));
        float kf = clamp(n * (0.2 + 0.55 * dens) * (0.7 + 0.6 * hash11(hm * 7.0 + fj)), 1.0, n - 1.0);
        float k0 = floor(kf), kfr = smoothstep(0.3, 0.7, fract(kf));
        float dir = mod(fj + hm * 2.0, 2.0) < 1.0 ? 1.0 : -1.0;
        float per = 1.0 + floor(3.0 * hash11(hm * 3.0 + fj * 5.0));    // a step every one to three beats
        float turn = dir * 6.2831853 * beats / (n * per);
        float sa = (ang - turn) / 6.2831853 * n;
        float st = floor(sa + 0.5);
        float stepW = mod(st, n);
        vec2 bp = rr * vec2(cos((st / n) * 6.2831853 + turn), sin((st / n) * 6.2831853 + turn));
        float d = length(loc / S - bp);
        float rb = min(0.42 * 6.2831853 * rr / n, 0.075);
        col += tone * 0.06 * exp(-pow((r - rr) / 0.006, 2.0));   // the ring's track, faint
        float hit = mix(euclidHit(stepW, k0, n), euclidHit(stepW, k0 + 1.0, n), kfr);
        float bead = smoothstep(rb, rb * 0.5, d);
        if (bead > 0.001) {
            vec3 photo = imgLod((p - loc) * 0.5 + 0.5 + bp * 0.3, 1.0);
            vec3 cb = mix(tone * 1.3, photo * 1.6, 0.5 + 0.45 * clamp(photoP, 0.0, 1.0));
            cb *= mix(0.18, 1.3 + 0.5 * clamp(audioKick, 0.0, 1.0), hit);
            col = mix(col, cb, bead);
        }
    }
    finish(col * 1.2);
}
