//@doc
 * @brief BROWNIAN TREE RAIN: Brownian trees growing and crumbling -- a rain of wandering particles (a diffusing
 * density, fed from the top) settles onto dendrites wherever it touches them, so the trees branch upward into the
 * rain the way diffusion-limited aggregation builds them; and the trees crumble again from their tips, faster when
 * the music drops, freeing room for new growth.  Seeds wait along the bottom.  Every grain of a tree is a round bead
 * coloured by the photo and by its age; the rain glimmers as dust.
 *
 * Audio Reactivity (structure, not only light):
 *   audioDrop       -> the trees crumble
 *   audioSwell      -> the rain thickens
 *   audioKick       -> the youngest grains flash (light)
 *
 * Knobs: rainP (the base rain), stickP (how readily the rain sticks), photoP (photo share), hueP.
//@params rainP stickP photoP
//@audio audioDrop audioSwell audioKick
//@state 240 135 40
//@body
/**  One step of the aggregation (the state pass): the rain diffuses and is fed from the top; an empty cell next to a
 * tree turns tree with a chance growing with the rain there and the tree around it; tree cells crumble from the tips.
 *
 * @return
 *   Tree (r: 1 if a grain), its age (g), the rain's density (b), 1.
 **/
vec4 stateStep()
{
    ivec2 ip = stCell();
    vec2 cr = stateRes;
    if (stateFrame < 0.5) {
        float seed = (ip.y < 2 && stRand(0) < 0.04) ? 1.0 : 0.0;
        return vec4(seed, 0.0, 0.2, 1.0);
    }
    vec4 s = stAt(ip);
    float nT = 0.0;
    for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
        if (i == 0 && j == 0) continue;
        int y = ip.y + j;
        if (y < 0 || y >= int(cr.y)) continue;                // no growth across the top and bottom edges
        nT += stAt(ip + ivec2(i, j)).r;
    }
    float rain = s.b + 0.2 * (stAt(ip + ivec2(1, 0)).b + stAt(ip - ivec2(1, 0)).b + stAt(ip + ivec2(0, 1)).b + stAt(ip - ivec2(0, 1)).b - 4.0 * s.b);
    rain += 0.02 * (stAt(ip + ivec2(0, 1)).b - s.b);            // the rain sinks a little
    float feed = (0.003 + 0.006 * clamp(rainP, 0.0, 1.0)) * (0.6 + 0.8 * clamp(audioSwell, 0.0, 1.0));
    if (float(ip.y) > cr.y - 3.0) rain += feed * 4.0;
    if (ip.y < 1) rain = 0.0;                                  // the floor swallows the rain
    rain = clamp(rain * 0.995, 0.0, 1.0);                     // the rain evaporates, so it stays thin
    float tree = s.r, age = s.g;
    if (tree < 0.5) {
        float pStick = (1.5 + 3.0 * clamp(stickP, 0.0, 1.0)) * rain * rain * min(nT, 2.0);
        if (nT > 0.5 && nT < 2.5 && stRand(1) < pStick) { tree = 1.0; age = 0.0; rain *= 0.1; }
        if (ip.y < 1 && stRand(2) < 0.0004) { tree = 1.0; age = 0.0; }   // a new seed now and then
    } else {
        age += 1.0;
        // crumbling: tips (few neighbours) go first, faster on a drop
        float pDie = (0.0006 + 0.03 * clamp(audioDrop, 0.0, 1.0)) * (nT < 1.5 ? 6.0 : 1.0);
        if (stRand(3) < pDie) { tree = 0.0; rain += 0.2; }
    }
    return vec4(tree, age, rain, 1.0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    vec2 cc = stView(p, 1.0);
    vec2 cell = floor(cc);
    vec3 tone = imgPalette(0.3 + 0.03 * audioPhase);
    vec3 col = imgLod(p * 0.3 + 0.5, 5.0) * 0.1;
    float rain = stLin(cc).b;
    col += tone * rain * 0.12 * (0.6 + 0.4 * noise2(cc * 0.5 + vec2(0.0, 3.0 * sceneTime)));   // the dust
    for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
        vec2 q = cell + vec2(float(i), float(j));
        vec4 s = texelFetch(texState, stWrap(ivec2(q)), 0);
        if (s.r < 0.5) continue;
        vec2 c = q + 0.5 + 0.2 * (hash22(q) - 0.5);
        float d = length(cc - c);
        float bead = smoothstep(0.62, 0.35, d);
        if (bead > 0.001) {
            float young = exp(-s.g / 30.0);
            vec3 photo = imgLod(c / stateRes.y * vec2(1.0, 1.0) * 0.9 + 0.05, 1.0);
            vec3 cb = mix(tone * 1.3, photo * 1.6, 0.5 + 0.45 * clamp(photoP, 0.0, 1.0)) * (0.7 + 0.4 * (1.0 - young));
            cb += mix(tone, vec3(1.0), 0.6) * young * (0.3 + 0.7 * clamp(audioKick, 0.0, 1.0)) * 0.6;
            col = mix(col, cb, bead);
        }
    }
    finish(col * 1.2);
}
