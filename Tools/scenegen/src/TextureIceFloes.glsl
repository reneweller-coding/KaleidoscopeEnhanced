//@doc
 * @brief TEXTURE ICE FLOES: pack ice seen from above -- white and pale-blue
 * floes of every size drift on the dark sea, slowly turning and jostling,
 * their edges rounded by the waves, pressure ridges running across them,
 * snow drifts textured by the photograph, meltwater ponds glowing turquoise
 * on some; between them black water with rafts of brash ice and a low sun
 * glinting on the leads.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the pack drifts (integrated, jump-free)
 *   audioSpread     -> the leads widen (floes spread apart)
 *   audioKick       -> sun glints on the water (light)
 *   audioMode       -> light: blue polar night in minor, pink midnight sun in major
 *   audioRoughness  -> more pressure ridges
 *   audioSwell      -> meltwater ponds (slow)
 *
 * Knobs: floeP (floe size), pondP (ponds), snowP (photo texture on the snow), hueP.
//@params floeP pondP snowP
//@audio audioSpread audioKick audioMode audioRoughness audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    float T = 0.05 * sceneTime + 0.4 * audioAdvance;
    float S = 2.5 + 4.0 * (1.0 - clamp(floeP, 0.0, 1.0));
    vec2 x = p * S + vec2(0.3 * T, 0.1 * T);
    vec2 i = floor(x), f = fract(x);
    float d1 = 9.0, d2 = 9.0; vec2 id = i; vec2 toC = vec2(0.0);
    for (int y = -1; y <= 1; ++y) for (int xx = -1; xx <= 1; ++xx) {
        vec2 o = vec2(xx, y);
        vec2 h = hash22(i + o);
        vec2 c = o + 0.5 + 0.3 * vec2(sin(T * (0.5 + h.x) + h.y * 6.28), cos(T * (0.4 + h.y) + h.x * 6.28));
        float d = length(f - c);
        if (d < d1) { d2 = d1; d1 = d; id = i + o; toC = f - c; } else if (d < d2) d2 = d;
    }
    float edge = d2 - d1;                                       // distance to the floe boundary
    float lead = 0.04 + 0.12 * clamp(audioSpread, 0.0, 1.0);
    lead *= 0.7 + 0.6 * noise2(x * 3.0);                         // uneven leads, rounded corners
    float px = fwidth(x.x) * 1.2;
    float ice = smoothstep(lead - px, lead + px, edge);
    // Floe surface: snow textured by the photo in the floe's own rotating frame.
    float h = hash21(id);
    vec2 lc = rot2(T * (h - 0.5) * 0.6 + h * 6.28) * toC;
    vec2 suv = lc * 0.25 + hash22(id + 3.0);
    float snow = luma(imgK(suv, 2.0));
    vec3 lightC = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.85, 0.85), mode);
    vec3 floe = mix(vec3(0.82, 0.88, 0.95), vec3(0.95, 0.97, 1.0), snow * clamp(snowP + 0.2, 0.0, 1.0)) * lightC;
    floe *= 0.85 + 0.15 * smoothstep(0.0, 0.25, edge);          // rounded, shaded rims
    // Pressure ridges: lines across the floe.
    float ridge = exp(-abs(dot(lc, vec2(0.8, 0.6)) * 8.0 + sin(dot(lc, vec2(-0.6, 0.8)) * 6.0) * 0.4 - (h - 0.5) * 3.0) * 6.0);
    floe *= 1.0 - 0.25 * ridge * step(0.4 - 0.3 * rough, hash21(id + 5.0));
    floe += lightC * ridge * 0.05;
    // Meltwater ponds.
    float pond = smoothstep(0.62, 0.7, fbm3(lc * 3.0 + h * 9.0)) * (0.3 + 0.7 * clamp(pondP, 0.0, 1.0)) * (0.4 + 0.8 * swell);
    floe = mix(floe, vec3(0.3, 0.75, 0.85) * lightC, clamp(pond, 0.0, 1.0) * smoothstep(0.1, 0.25, edge));
    // Water: dark, with brash ice and sun glints.
    vec3 water = mix(vec3(0.02, 0.04, 0.07), vec3(0.05, 0.04, 0.07), mode);
    float brash = smoothstep(0.7, 0.8, noise2(x * 25.0)) * smoothstep(lead * 1.5, 0.0, edge);
    water += vec3(0.6, 0.65, 0.7) * brash * 0.5;
    vec2 sg = x * 20.0;
    vec2 si = floor(sg), sf = fract(sg);
    float tw = pow(max(0.0, sin(sceneTime * (0.8 + hash21(si)) + hash21(si + 1.0) * 30.0)), 10.0);
    float glint = smoothstep(0.3, 0.0, length(sf - 0.25 - 0.5 * hash22(si))) * step(0.85, hash21(si + 2.0)) * tw;
    water += lightC * glint * (0.3 + 1.2 * kick);
    vec3 col = mix(water, floe, ice);
    col = mix(col, col * glowColour(imgLod(p * 0.5 + 0.5, 6.0), p, hueP * 0.159) * 1.3, 0.06);
    finish(col);
}
