//@doc
 * @brief SUBSTRATE CRACKS: in the manner of Jared Tarbell's "Substrate" --
 * straight lines grow across the plane like cracks, each starting from an
 * existing line at a right angle and running until it hits another,
 * carving the space into an architectural city map of rectangles and
 * slivers; soft watercolour sand trails along one side of each crack in
 * colours sampled from the photograph; the map slowly redraws itself
 * region by region.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the cracks grow and the map redraws (integrated, jump-free)
 *   audioSpread     -> crack density
 *   audioKick       -> the crack lines darken (light)
 *   audioMode       -> the paper: white in major, dark with light lines in minor (blend)
 *   audioRoughness  -> the angle of the cracks varies more
 *   audioSwell      -> the colour trails widen (slow)
 *
 * Knobs: scaleP (map scale), trailP (colour trail width), photoP (photo colours), hueP.
//@params scaleP trailP photoP
//@audio audioSpread audioKick audioMode audioRoughness audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = smoothstep(0.3, 0.7, clamp(audioMode, 0.0, 1.0));
    float rough = clamp(audioRoughness, 0.0, 1.0);
    // Recursive axis-aligned (slightly tilted) subdivision gives the crack map:
    // each region is split by a crack at a random position, recursively.
    float S = 1.0 + 1.5 * clamp(scaleP, 0.0, 1.0);
    float tilt = 0.3 + 0.2 * rough * sin(0.01 * sceneTime);
    vec2 q = rot2(tilt) * p * S + vec2(0.01 * sceneTime, 0.0);
    vec2 lo = floor(q), hi = lo + 1.0;
    vec2 id = lo;
    float T = 0.05 * sceneTime + 0.3 * audioAdvance;
    float depth = 4.0 + 3.0 * clamp(audioSpread, 0.0, 1.0);
    float dmin = 9.0; float side = 0.0; float trailD = 9.0; vec2 trailId = id;
    for (int k = 0; k < 7; ++k) {
        if (float(k) >= depth) break;
        float h = hash21(id + float(k) * 13.1);
        vec2 sz = hi - lo;
        bool vert = sz.x > sz.y ? h < 0.8 : h < 0.2;
        // Crack growth: each crack appears over time (continuous): its extent grows from its start.
        float birth = fract(T * 0.3 + hash21(id + 7.0 + float(k)));
        float s = 0.3 + 0.4 * hash21(id + float(k) * 3.7);
        if (vert) {
            float x = mix(lo.x, hi.x, s);
            float grown = smoothstep(0.0, 0.3, birth) * smoothstep(1.0, 0.9, birth);
            float yEnd = mix(lo.y, hi.y, grown);
            float d = abs(q.x - x) + max(q.y - yEnd, 0.0) * 10.0;
            if (d < dmin) { dmin = d; side = sign(q.x - x); }
            if (q.x < x) { hi.x = x; id = id * 2.0 + vec2(1.0, 0.0); trailD = min(trailD, x - q.x); }
            else { lo.x = x; id = id * 2.0 + vec2(2.0, 0.0); }
        } else {
            float y = mix(lo.y, hi.y, s);
            float grown = smoothstep(0.0, 0.3, birth) * smoothstep(1.0, 0.9, birth);
            float xEnd = mix(lo.x, hi.x, grown);
            float d = abs(q.y - y) + max(q.x - xEnd, 0.0) * 10.0;
            if (d < dmin) { dmin = d; side = sign(q.y - y); }
            if (q.y < y) { hi.y = y; id = id * 2.0 + vec2(0.0, 1.0); trailD = min(trailD, y - q.y); }
            else { lo.y = y; id = id * 2.0 + vec2(0.0, 2.0); }
        }
        id = mod(id, 997.0);
    }
    dmin = min(dmin, min(min(q.x - floor(q.x), ceil(q.x) - q.x), min(q.y - floor(q.y), ceil(q.y) - q.y)));
    float px = fwidth(q.x) * 1.2;
    float crack = smoothstep(px * 1.5, 0.0, dmin);
    // Sand-painted colour trail on one side of each crack.
    vec3 pc = imgLod(hash22(id) * 0.8 + 0.1, 3.0);
    pc = glowColour(pc, id * 0.01, hueP * 0.159);
    float tw = 0.02 + 0.06 * clamp(trailP, 0.0, 1.0) * (0.6 + 0.8 * swell);
    float grain = noise2(p * 700.0);                            // sand grain (smooth noise, no pixel grid)
    float trail = exp(-trailD / tw) * step(grain, exp(-trailD / tw) * 0.9);
    vec3 paper = vec3(0.96, 0.95, 0.92);
    vec3 lightV = mix(paper, pc * 0.9, trail * clamp(photoP + 0.3, 0.0, 1.3) * 0.7);
    lightV = mix(lightV, vec3(0.05) * (1.0 - 0.5 * kick), crack);
    vec3 darkV = mix(vec3(0.03, 0.03, 0.04), pc * 0.8, trail * 0.7);
    darkV = mix(darkV, vec3(0.9) * (1.0 + 0.3 * kick), crack);
    finish(mix(darkV, lightV, mode));
}
