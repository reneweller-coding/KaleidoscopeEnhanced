//@doc
 * @brief KALEIDO TIME ECHO: a kaleidoscope tunnel in which every ring of the depth shows the kaleidoscope a moment
 * earlier: the state field keeps the last eight frames of a turning photo kaleidoscope as eight tiles, the newest
 * written each step; the frame shows them as rings, the newest outermost, so every movement runs as a spiral into
 * the depth.  Between two rings the tiles are blended, so the echo has no steps.  The photo's own colours, calmed
 * toward one colour family; deeper rings dimmer.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the kaleidoscope turns (integrated): what the rings echo
 *   audioSwell   -> the rings' light
 *   audioOnset   -> the newest ring flares (light)
 *
 * Knobs: sidesP (the kaleidoscope's symmetry), depthP (how fast the rings shrink into the depth), hueP.  Distinct
 * from FeedbackKaleidoscope, which reuses the whole last frame.
//@params sidesP depthP
//@audio audioSwell audioOnset
//@state 1536 144 10
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

/**  The kaleidoscope at this moment at a point of a tile (-1..1 square).
 *
 * @param q      The point. (in)
 * @param sides  The symmetry. (in)
 *
 * @return
 *   The photo's colour there.
 **/
vec3 kaleidoNow(vec2 q, float sides)
{
    float sec = 6.2831853 / sides;
    float th = atan(q.y, q.x) + 0.05 * sceneTime + 0.3 * audioAdvance;
    float a = abs(mod(th, sec) - 0.5 * sec);
    vec2 k = length(q) * vec2(cos(a), sin(a));
    return imgLod(k * 0.42 + vec2(0.5, 0.42), 0.6);
}

/**  One step of the state field: the tile at the head gets the kaleidoscope as it is now, the others keep theirs.
 *
 * @return
 *   The colour.
 **/
vec4 stateStep()
{
    ivec2 ip = stCell();
    int tile = ip.x / 192;
    int head = int(mod(stateFrame, 8.0));
    if (tile != head && stateFrame > 0.5) return texelFetch(texState, ip, 0);
    vec2 q = (vec2(ip.x - tile * 192, ip.y) + 0.5) / vec2(192.0, 144.0) * 2.0 - 1.0;
    q.x *= 192.0 / 144.0;
    float sides = floor(6.0 + 4.0 * clamp(sidesP, 0.0, 1.0));
    return vec4(kaleidoNow(q, sides), 1.0);
}

/**  A ring's picture: tile number (age) n at a point of the tile.
 *
 * @param age  How many steps back (0 the newest). (in)
 * @param q    The point (-1..1, the tile's aspect). (in)
 *
 * @return
 *   The colour.
 **/
vec3 echoAt(float age, vec2 q)
{
    int head = int(mod(stateFrame, 8.0));
    int tile = int(mod(float(head) - age + 8.0, 8.0));
    vec2 cell = vec2(float(tile) * 192.0, 0.0) + (q / vec2(192.0 / 144.0, 1.0) * 0.5 + 0.5) * vec2(192.0, 144.0);
    cell = clamp(cell, vec2(float(tile) * 192.0 + 1.0, 1.0), vec2(float(tile) * 192.0 + 191.0, 143.0));
    return stLin(cell).rgb;
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float fh = famHue();
    float shrink = 0.72 + 0.12 * clamp(depthP, 0.0, 1.0);       // each ring this much smaller than the last
    float r = max(length(p), 1e-4);
    // which ring (age) a point lies in: rings shrink geometrically toward the middle
    float ringF = log(r / 0.62) / log(shrink);                   // 0 at the outer ring, growing inward
    ringF = max(ringF, 0.0);
    float n = floor(ringF), fr = ringF - n;
    // the point in the ring's own tile: scaled back to the tile's size
    vec2 qA = p / (0.62 * pow(shrink, n)), qB = p / (0.62 * pow(shrink, n + 1.0));
    vec3 a = echoAt(min(n, 7.0), qA), b = echoAt(min(n + 1.0, 7.0), qB);
    // outside the outer ring the kaleidoscope is shown as it is now (the newest ring is one step behind it)
    vec3 now = kaleidoNow(p / 0.62, floor(6.0 + 4.0 * clamp(sidesP, 0.0, 1.0)));
    vec3 col = tone(mix(mix(a, b, smoothstep(0.7, 1.0, fr)), now, smoothstep(0.6, 0.66, r)), fh);
    col *= pow(0.86, ringF) * (0.8 + 0.4 * clamp(audioSwell, 0.0, 1.0));
    col += famLight(fh, 0.6, 0.6) * exp(-ringF * 3.0) * clamp(audioOnset, 0.0, 1.0) * 0.4 * smoothstep(0.62, 0.4, r);
    finish(col);
}
