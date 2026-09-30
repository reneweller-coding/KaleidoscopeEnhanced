//@doc
 * @brief TEXTURE AURORA FIELD: lying on your back under a great aurora -- the
 * whole sky is curtains of light converging toward the zenith (the corona),
 * rays and folds rippling, green fading up into red and violet, and the
 * colours and the shape of the folds come from the photograph: its colours
 * where it has them, its structure as the ripples running along the
 * curtains.  No horizon: the view is straight up, the curtains radiate in
 * all directions, so the field continues past the edges and mirrors.
 * Stars show through where the curtains thin.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the corona turns slowly (integrated)
 *   audioAdvance    -> the folds travel along the curtains (integrated)
 *   audioSpread     -> how many curtains (wide spectrum = more, finer)
 *   audioRoughness  -> the curtains ripple faster and finer
 *   audioMode       -> the colours: classic green in minor, pinks and violets in major (slow blend)
 *   audioSwell      -> brightness of the aurora (slow)
 *   audioHigh       -> the rays flicker at their lower edges (light)
 *
 * Knobs: foldsP (fold depth), rayP (ray fineness), photoP (share of photo colour), hueP.
//@params foldsP rayP photoP
//@audio audioPhase audioSpread audioRoughness audioMode audioSwell audioHigh
//@body
void main()
{
    vec2 p = screenP() * 1.4;
    float swell = clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    float r = length(p);
    float a = atan(p.y, p.x) + 0.02 * sceneTime + 0.2 * audioPhase;
    vec2 dir = vec2(cos(a), sin(a));

    // Night sky with stars (round, jittered).
    vec3 col = vec3(0.005, 0.01, 0.03);
    {
        vec2 g = p * 60.0, gi = floor(g), gf = fract(g);
        vec2 gc = 0.25 + 0.5 * hash22(gi);
        col += vec3(0.8, 0.85, 1.0) * smoothstep(0.1, 0.0, length(gf - gc)) * step(0.985, hash21(gi + 5.0)) * 0.7;
    }

    // Curtains: bands along circles around the zenith, folded by a noise
    // along the angle (seamless: noise on the unit circle).
    float nC = 2.0 + 3.0 * clamp(audioSpread, 0.0, 1.0);
    float fold = 0.25 + 0.45 * clamp(foldsP, 0.0, 1.0);
    float flow = 0.08 * sceneTime + 0.8 * audioAdvance;
    vec3 aur = vec3(0.0);
    for (int k = 0; k < 4; ++k) {
        float fk = float(k);
        float rk = 0.3 + fk * 0.3 + 0.15 * sin(fk * 2.7);
        // Photo structure bends the curtain: sample the photo along the angle.
        vec2 tq = dir * (0.35 + fk * 0.12) + 0.5 + vec2(flow * 0.05, 0.0);
        float photoBend = luma(imgLod(tq, 6.0)) - 0.5;
        // Big slow meanders (the curtain snakes across the sky), fine folds on top.
        float bend = fold * 1.6 * (noise2(dir * (0.9 + 0.3 * fk) + vec2(flow * 0.5, fk * 3.0)) - 0.5)
                   + 0.25 * fold * (noise2(dir * 6.0 + vec2(flow * 2.0, fk)) - 0.5) + 0.4 * photoBend;
        float d = r - rk - bend * 0.5;
        // Curtain: sharp lower edge (outer side toward the viewer), long glow upward.
        float lower = smoothstep(-0.03, 0.0, d);
        float glow = lower * exp(-max(d, 0.0) * 9.0);
        // Rays: fine streaks radiating from the zenith.
        float rf = 60.0 + 120.0 * clamp(rayP, 0.0, 1.0);
        // Irregular rays: noise around the circle at a fine scale, shifting with the flow.
        float rn = noise2(dir * rf * 0.1 + vec2(fk * 5.0, flow * (0.8 + 1.5 * rough))) * 0.65 + noise2(dir * rf * 0.3 + vec2(fk, flow * 2.0)) * 0.35;
        float rays = smoothstep(0.35, 0.85, rn);
        rays = mix(rays, 1.0, smoothstep(0.02, 0.0, abs(d)) * 0.5);
        float flick = 1.0 + 0.6 * hi * (noise2(dir * 40.0 + sceneTime * 3.0) - 0.5) * smoothstep(0.08, 0.0, d);
        float I = glow * (0.15 + 1.3 * rays) * flick * smoothstep(fk - 0.5, fk + 0.5, nC) * 0.8;
        // Colour: green at the edge, rising into red/violet; tinted by the photo.
        float mode = clamp(audioMode, 0.0, 1.0);
        vec3 edgeC = mix(vec3(0.2, 1.0, 0.45), vec3(1.0, 0.35, 0.7), mode * 0.6);
        vec3 topC = mix(vec3(0.8, 0.15, 0.4), vec3(0.5, 0.25, 1.0), mode);
        vec3 c = mix(edgeC, topC, smoothstep(0.0, 0.25, d));
        vec3 phC = glowColour(imgLod(tq, 5.0), dir + fk, hueP * 0.159);
        c = mix(c, phC, 0.35 * clamp(photoP, 0.0, 1.0) + 0.1);
        aur += c * I;
    }
    // The corona: the curtains converge into a bright knot at the zenith.
    aur += vec3(0.5, 1.0, 0.6) * exp(-r * 7.0) * 0.25;
    col = col * (1.0 - clamp(luma(aur), 0.0, 1.0)) + aur * (0.7 + 0.8 * swell);
    finish(col);
}
