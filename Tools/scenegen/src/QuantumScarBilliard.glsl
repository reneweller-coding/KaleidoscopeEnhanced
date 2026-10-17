//@doc
 * @brief QUANTUM SCAR BILLIARD: eigenstates of a chaotic stadium billiard look like random waves -- except the scarred
 * ones, whose probability piles up along an unstable periodic orbit: the bouncing ball, the bowtie, the diamond, the
 * V.  Here a random-wave background (Berry's model) carries a scar along one orbit at a time; the stadium is
 * mirrored across the frame.  The probability density lays bare the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> each change of harmony moves the scar to the next periodic orbit (crossfaded)
 *   audioBass       -> the scar's strength over the random background
 *   audioPhase      -> the waves' phases turn (integrated): the speckle shimmers
 *   audioKick       -> the scar flashes (light)
 *
 * Knobs: waveP (the wavenumber: finer or coarser waves), scarP (the base scar strength), photoP (photo share), hueP.
//@params waveP scarP photoP
//@audio audioBass audioKick audioHarmAdvance
//@body
/**  The distance from a point to one of the stadium's periodic orbits (stadium: straight sides of length 2, round
 * ends of radius 1).
 *
 * @param x  The point in the stadium. (in)
 * @param k  The orbit: 0 bouncing ball, 1 bowtie, 2 diamond, 3 the long axis. (in)
 *
 * @return
 *   The distance to the orbit.
 **/
float orbitDist(vec2 x, int k)
{
    if (k == 0) return abs(x.x - 0.4);                          // a bouncing-ball orbit: up and down
    if (k == 1) {
        float a = sdSeg(x, vec2(-1.7, 0.7), vec2(1.7, -0.7));
        return min(a, sdSeg(x, vec2(-1.7, -0.7), vec2(1.7, 0.7)));
    }
    if (k == 2) {
        float a = min(sdSeg(x, vec2(-2.0, 0.0), vec2(0.0, 1.0)), sdSeg(x, vec2(0.0, 1.0), vec2(2.0, 0.0)));
        return min(a, min(sdSeg(x, vec2(2.0, 0.0), vec2(0.0, -1.0)), sdSeg(x, vec2(0.0, -1.0), vec2(-2.0, 0.0))));
    }
    return abs(x.y);
}

void main()
{
    vec2 p = screenP();
    vec2 box = vec2(2.0, 1.0);
    vec2 q = p * 2.4;
    vec2 x = box - abs(mod(q + box, 4.0 * box) - 2.0 * box);      // the stadium's box mirrored across the frame
    bool inside = abs(x.x) <= 1.0 || length(vec2(abs(x.x) - 1.0, x.y)) < 1.0;
    float k = 18.0 + 22.0 * clamp(waveP, 0.0, 1.0);
    // random waves: plane waves of one wavenumber in many directions with fixed random phases
    float ph = 0.08 * audioPhase + 0.05 * sceneTime;
    float psi = 0.0;
    for (int i = 0; i < 24; ++i) {
        float fi = float(i);
        float a = 6.2831853 * hash11(fi * 1.31 + 0.2);
        psi += cos(k * dot(x, vec2(cos(a), sin(a))) + 6.2831853 * hash11(fi * 2.7) + ph * (1.0 + 0.3 * hash11(fi)));
    }
    psi /= 4.9;
    // the scar: a standing wave along the orbit, strongest on it
    float h = max(audioHarmAdvance, 0.0);
    int o0 = int(mod(floor(h), 4.0)), o1 = int(mod(floor(h) + 1.0, 4.0));
    float g = smoothstep(0.2, 0.8, fract(h));
    float sc = (0.6 + 1.6 * clamp(scarP, 0.0, 1.0)) * (0.6 + 0.8 * clamp(audioBass, 0.0, 1.0));
    float d0 = orbitDist(x, o0), d1 = orbitDist(x, o1);
    float env = mix(exp(-d0 * d0 * k * 0.8), exp(-d1 * d1 * k * 0.8), g);
    float scar = cos(k * mix(d0, d1, g) + ph) * env;           // fringes running along the orbit
    float dens = pow(psi + sc * scar * 2.0, 2.0) * 0.5;
    float lit = 1.0 - exp(-dens);
    vec2 uv = p * 0.7 + 0.5;
    vec3 photo = imgLod(uv, 0.5);
    vec3 tone = imgPalette(0.3 + 0.4 * env + 0.03 * audioPhase);
    vec3 col = inside ? mix(tone * 1.2, photo * 1.4, 0.35 + 0.5 * clamp(photoP, 0.0, 1.0)) * lit : imgLod(uv, 2.0) * 0.08;
    col += inside ? mix(tone, vec3(1.0), 0.6) * env * lit * 0.4 * (0.4 + clamp(audioKick, 0.0, 1.0)) : vec3(0.0);
    finish(col);
}
