//@doc
 * @brief REACTOR POOL BLUE GLOW: looking down into a reactor pool: the core's square fuel assemblies, each a grid of
 * rods, glow in Cherenkov blue under deep water, the light blooming up round them, while waves cross the surface and
 * bend the view, caustics flickering softly over the core.  The surface's height is a sum of travelling waves; its
 * slope shifts where the eye looks on the bottom, its curvature lights the caustics; the core is a disc of assemblies
 * with a few left empty, its glow spreading outward.  The blue is pulled a little toward the photo's hue.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the waves run over the surface (integrated: with the music's rhythm and drive)
 *   audioBass    -> the waves' height (softened by the swell)
 *   audioSwell   -> the glow's strength
 *
 * Knobs: rodP (the assemblies' size), waveP (how fine the waves are), hueP.
//@params rodP waveP
//@audio audioBass audioSwell
//@body
/**  The water's surface height and slope.
 *
 * @param p    The place. (in)
 * @param run  The waves' run. (in)
 * @param amp  The waves' height. (in)
 * @param k    The waves' fineness. (in)
 *
 * @return
 *   xy the slope, z the curvature.
 **/
vec3 surface(vec2 p, float run, float amp, float k)
{
    vec2 g = vec2(0.0);
    float lap = 0.0;
    for (int i = 0; i < 4; ++i) {
        float fi = float(i);
        float a = 1.3 * fi + 0.4;
        vec2 dir = vec2(cos(a), sin(a));
        float kk = k * (1.0 + 0.45 * fi);
        float ph = kk * dot(p, dir) - run * (1.0 + 0.2 * fi);
        float A = amp / (1.0 + fi);
        g += A * kk * cos(ph) * dir;
        lap -= A * kk * kk * sin(ph);
    }
    return vec3(g, lap);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float bh = fract(0.58 + 0.25 * (fract(fh - 0.58 + 0.5) - 0.5));
    float S = 0.11 + 0.05 * clamp(rodP, 0.0, 1.0);
    float k = 6.0 + 6.0 * clamp(waveP, 0.0, 1.0);
    float run = 0.3 * sceneTime + 1.2 * audioAdvance;
    float amp = 0.004 + 0.01 * mix(clamp(audioSwell, 0.0, 1.0), clamp(audioBass, 0.0, 1.0), 0.5);
    float glow = 0.6 + 0.7 * clamp(audioSwell, 0.0, 1.0);
    vec3 sf = surface(p, run, amp, k);
    vec2 q = p + sf.xy * 0.9;                                         // the view bent by the surface
    // the core: square assemblies in a disc, a few left empty, each a grid of rods
    vec2 cid = floor(q / S);
    vec2 f = fract(q / S) - 0.5;
    float hc = hash21(cid);
    float inCore = smoothstep(0.82, 0.74, length((cid + 0.5) * S)) * step(0.12, hc);
    vec2 rf = fract((f + 0.5) * 8.0) - 0.5;
    float rods = smoothstep(0.32, 0.18, length(rf)) * smoothstep(0.48, 0.44, max(abs(f.x), abs(f.y)));
    float gap = smoothstep(0.5, 0.46, max(abs(f.x), abs(f.y)));
    vec3 blue = hsv2rgb(vec3(bh, 0.55, 1.0));
    float r = length(q);
    float bloom = exp(-r * r / 0.35) * 0.6 + 0.15;
    vec3 col = blue * 0.05;
    col += blue * inCore * (0.3 + 0.5 * rods) * gap * glow * 0.8;
    col += mix(blue, vec3(0.8, 0.9, 1.0), 0.3) * bloom * glow * 0.45;
    col += mix(blue, vec3(1.0), 0.5) * smoothstep(0.5, 2.5, sf.z * 4.0 / max(amp * k * k, 1e-4)) * 0.15 * bloom;   // the caustics
    finish(col);
}
