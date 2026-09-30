//@doc
 * @brief MILK DYE BURST: the kitchen experiment of food colour on milk
 * touched with soap -- blobs of vivid dye rest on the white milk, and at
 * wandering points the surface tension breaks: the dye rushes outward in
 * a burst of streaks and fingers, petals of colour stretch and swirl,
 * then the flow calms and the colours drift until the next burst elsewhere.
 * The dye colours come from the photograph.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the bursts and the drift (integrated, jump-free)
 *   audioSpread     -> burst strength
 *   audioRoughness  -> the fingering of the streaks
 *   audioKick       -> the milk's sheen flares (light)
 *   audioMode       -> palette: cool dyes in minor, warm in major
 *   audioSwell      -> how much dye lies on the milk (slow)
 *
 * Knobs: blobP (dye blob size), burstP (burst reach), milkP (milk whiteness), hueP.
//@params blobP burstP milkP
//@audio audioSpread audioRoughness audioKick audioMode audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    float T = 0.05 * sceneTime + 0.3 * audioAdvance;
    // Bursts: sources that pulse (strength rises fast, relaxes slowly)
    // at slowly wandering places; the displacement pushes dye outward
    // along streaks.
    vec2 x = p;
    float streakAcc = 0.0;
    float reach = (0.3 + 0.5 * clamp(burstP, 0.0, 1.0)) * (0.6 + 0.8 * clamp(audioSpread, 0.0, 1.0));
    for (int i = 0; i < 4; ++i) {
        float fi = float(i);
        float ph = T * (0.6 + 0.2 * fi) + fi * 1.7;
        float pulse = pow(0.5 + 0.5 * sin(ph), 3.0);             // burst strength, smooth
        vec2 c = 0.5 * vec2(sin(0.07 * sceneTime * (1.0 + 0.3 * fi) + fi * 2.1), cos(0.05 * sceneTime * (1.0 + 0.2 * fi) + fi * 1.3));
        vec2 d = x - c;
        float r = length(d) + 1e-4;
        float ang = atan(d.y, d.x);
        // Fingering: the outward push varies with angle (on the unit circle, no seam).
        vec2 u = vec2(cos(ang), sin(ang));
        float fing = 0.6 + 0.5 * noise2(u * (3.0 + 5.0 * rough) + fi * 9.0) + 0.15 * noise2(u * 9.0 + fi);
        float push = reach * pulse * fing * r / (r * r + 0.05) * 0.35;
        x -= d / r * push;                                      // sample from further in: dye moves out
        streakAcc += pulse * fing * exp(-r * 2.0);
    }
    // Dye field: blobs of colour in the (advected) coordinates.
    float bs = 2.5 + 3.0 * (1.0 - clamp(blobP, 0.0, 1.0));
    vec2 g = x * bs + vec2(0.02 * sceneTime, 0.0);
    vec2 gi = floor(g);
    vec3 dye = vec3(0.0); float cover = 0.0;
    for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
        vec2 id = gi + vec2(i, j);
        vec2 c = id + 0.5 + 0.35 * (hash22(id) - 0.5);
        float rr = 0.25 + 0.2 * hash21(id + 3.0) + 0.1 * swell;
        float dd = length(g - c + 0.15 * (vec2(fbm3(g * 1.5 + id), fbm3(g * 1.5 + id + 4.0)) - 0.5));
        float blob = smoothstep(rr, rr * 0.35, dd) * step(0.3, hash21(id + 8.0));
        blob *= 0.55 + 0.45 * fbm3(g * 3.0 + id * 1.7);             // marbled concentration
        vec3 dc = glowColour(imgLod(hash22(id + 2.0), 4.0), id * 0.37, hueP * 0.159 + hash21(id) * 0.6);
        dye += dc * blob;
        cover += blob;
    }
    dye /= max(cover, 1.0);
    cover = clamp(cover, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    dye = mix(dye, dye * mix(vec3(0.8, 0.9, 1.2), vec3(1.2, 0.9, 0.75), mode), 0.5);
    dye = max(mix(vec3(luma(dye)), dye, 1.4), 0.0);
    // Milk: creamy white, slightly shaded by the photo.
    vec2 uv = p * 0.6 + 0.5;
    vec3 milk = mix(vec3(1.3, 1.27, 1.2), vec3(0.8, 0.8, 0.78) + imgK(uv, 5.0) * 0.15, 1.0 - clamp(milkP, 0.0, 1.0));
    vec3 col = mix(milk, dye * 0.9, smoothstep(0.0, 0.7, cover));
    // Thin dye films between the blobs where the streaks stretched them.
    col = mix(col, mix(milk, dye, 0.5), 0.2 * smoothstep(0.1, 0.6, streakAcc) * (1.0 - cover));
    // Sheen on the milk.
    float sheen = pow(max(0.0, fbm3(p * 1.2 + vec2(0.0, 0.02 * sceneTime))), 3.0);
    col += vec3(1.0) * sheen * (0.05 + 0.2 * kick);
    finish(col);
}
