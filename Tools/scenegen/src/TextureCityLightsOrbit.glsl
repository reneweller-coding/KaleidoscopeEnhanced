//@doc
 * @brief TEXTURE CITY LIGHTS ORBIT: the Earth at night seen from orbit,
 * gliding slowly beneath -- the photograph becomes a continent: where it
 * is bright, cities sprawl as clusters of countless tiny sodium-orange and
 * white lights, strung together by glowing roads along its edges; its
 * dark areas are sea and wilderness, faintly moonlit; thin clouds drift
 * over it, lit from within now and then by lightning.  Endless,
 * mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the orbit (integrated, jump-free)
 *   audioSpread     -> the cities sprawl further
 *   audioKick       -> lightning in the clouds (light)
 *   audioHigh       -> the lights twinkle through the air (light)
 *   audioMode       -> sodium orange in minor, LED white in major
 *   audioSwell      -> the cloud cover (slow)
 *
 * Knobs: cityP (light density), roadP (road glow), cloudP, hueP.
//@params cityP roadP cloudP
//@audio audioSpread audioKick audioHigh audioMode audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    vec2 orbit = vec2(0.012, 0.004) * sceneTime + vec2(0.08, 0.02) * audioAdvance;
    vec2 w = p + orbit;
    vec2 uv = w * 0.55 + 0.5;
    // Urbanisation from the photo.
    float urb = clamp(luma(imgLod(uv, 3.5)) - luma(imgLod(uv, 7.0)) + 0.5, 0.0, 1.0);
    float urbC = smoothstep(0.5 - 0.12 * clamp(audioSpread, 0.0, 1.0), 0.7, urb + 0.15 * (fbm3(w * 4.0) - 0.5));
    // Ground: dark land and sea, moonlit.
    float land = smoothstep(0.2, 0.35, luma(imgLod(uv, 5.0)));
    vec3 col = mix(vec3(0.005, 0.01, 0.025), vec3(0.02, 0.022, 0.025) + imgLod(uv, 2.0) * 0.03, land);
    vec3 sodium = vec3(1.0, 0.6, 0.2), led = vec3(0.95, 0.95, 1.0);
    vec3 lc = mix(sodium, led, mode);
    lc = mix(lc, glowColour(imgLod(uv, 5.0), w, hueP * 0.159), 0.12);
    // City glow (the bloom of many lights).
    col += lc * urbC * urbC * 0.3;
    // Individual lights: round jittered points in two scales.
    float dens = (0.3 + 0.7 * clamp(cityP, 0.0, 1.0));
    for (int L = 0; L < 2; ++L) {
        float fl = float(L);
        vec2 g = w * (70.0 + 50.0 * fl) + fl * 9.0;
        vec2 gi = floor(g), gf = fract(g);
        vec2 c = 0.2 + 0.6 * hash22(gi + fl * 3.0);
        vec2 cw = (gi + c - fl * 9.0) / (70.0 + 50.0 * fl);
        vec2 cuv = cw * 0.55 + 0.5;
        float u = smoothstep(0.47 - 0.12 * clamp(audioSpread, 0.0, 1.0), 0.65, luma(imgLod(cuv, 3.5)) - luma(imgLod(cuv, 7.0)) + 0.5 + 0.15 * (fbm3(cw * 4.0) - 0.5));
        float on = step(hash21(gi + 7.0 + fl), u * dens);
        float d = length(gf - c);
        float tw = 0.8 + 0.2 * sin(sceneTime * (3.0 + 4.0 * hash21(gi)) + hash21(gi + 1.0) * 6.28) * hi;
        vec3 tint = mix(lc, mix(sodium, led, step(0.7, hash21(gi + 3.0))), 0.4);
        col += tint * on * (smoothstep(0.28, 0.06, d) * 1.3 + exp(-d * 5.0) * 0.2) * tw * (1.0 - 0.3 * fl);
    }
    // Roads along the photo's edges, between the cities.
    float ed = texEdge(uv, 2.5);
    col += lc * smoothstep(0.25, 0.7, ed) * (0.05 + 0.2 * clamp(roadP, 0.0, 1.0)) * smoothstep(0.35, 0.55, urb);
    // Clouds drifting at their own pace, moonlit, lightning inside.
    vec2 cq = p * 1.4 + vec2(0.02, 0.008) * sceneTime + orbit * 0.6;
    float cl = fbm(cq + 0.5 * vec2(fbm3(cq * 0.8), fbm3(cq * 0.8 + 3.0)));
    float cover = smoothstep(0.62 - 0.2 * clamp(cloudP, 0.0, 1.0) - 0.1 * swell, 0.9, cl);
    vec3 cloudC = vec3(0.05, 0.06, 0.08) + lc * urbC * 0.08;
    // Lightning: one wandering cell flashes with the kick.
    vec2 lp = 0.5 * vec2(sin(0.13 * sceneTime), cos(0.11 * sceneTime));
    float bolt = kick * exp(-length(p - lp) * 4.0) * cover;
    cloudC += vec3(0.7, 0.75, 1.0) * bolt * 1.5;
    col = mix(col, cloudC, cover * 0.85);
    // The thin blue airglow haze.
    col += vec3(0.01, 0.02, 0.05) * (1.0 + length(p));
    finish(col);
}
