//@doc
 * @brief KPZ GROWTH FRONTS: ballistic deposition -- grains rain onto every column and stick at the first contact, so
 * the surface grows with overhangs into a rough front of the Kardar-Parisi-Zhang kind, ragged on every scale.  Shown
 * in polar form, folded six ways: rough rings grow outward from the centre in endless succession, each layer laid
 * down in its own cut of the photo, the strata between them as fine lines.  The field is periodic: a front that
 * leaves the frame is born again at the centre.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the deposition rate: loud passages grow faster
 *   audioRoughness  -> the share of grains that stick sideways (rough music, rougher fronts)
 *   audioPhase      -> the palette turns through the photo (integrated)
 *   audioKick       -> the newest layer flashes (light)
 *
 * Knobs: stickP (how many grains stick sideways at rest), layerP (layer thickness), sectorsP (the fold: 4..8
 * sectors), hueP.
//@params stickP layerP sectorsP
//@audio audioSwell audioKick audioRoughness
//@state 360 300 30 32
//@body
/**  A random number for this column and step, the same in every cell of the column.
 *
 * @param x  The column. (in)
 * @param k  Which of the column's random streams. (in)
 *
 * @return
 *   A pseudo-random number 0..1.
 **/
float colRand(int x, int k)
{
    return float(stHashU(uint(x) + stHashU(uint(stateFrame) * 4u + uint(k))) >> 8u) / 16777216.0;
}

/**  One deposition step for this cell (the state pass): every cell carries its column's height, so the column
 * grows alike in all of them; a cell the growth passes takes the step as its arrival time.
 *
 * @return
 *   Arrival step, the column's height (unwrapped), 0, 1.
 **/
vec4 stateStep()
{
    ivec2 ip = stCell();
    float hgt = stateRes.y;
    if (stateFrame < 0.5)                                      // earlier laps' strata, a little rough already
        return vec4(-(hgt - float(ip.y) + 6.0 * noise2(vec2(float(ip.x) * 0.15, 0.3))) * 1.6, 0.0, 0.0, 1.0);
    vec4 c = stAt(ip);
    float h = c.g, hl = stAt(ip - ivec2(1, 0)).g, hr = stAt(ip + ivec2(1, 0)).g;
    float rate = 0.35 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float stick = clamp(0.3 + 0.6 * clamp(stickP, 0.0, 1.0) + 0.3 * (clamp(audioRoughness, 0.0, 1.0) - 0.5), 0.0, 1.0);
    float h2 = h;
    if (colRand(ip.x, 0) < rate)
        h2 = colRand(ip.x, 1) < stick ? max(h + 1.0, max(hl, hr)) : h + 1.0;
    h2 = min(h2, h + hgt - 1.0);                                // never a whole lap at once
    float arrive = c.r;
    if (mod(float(ip.y) - h, hgt) < h2 - h) arrive = stateFrame;
    return vec4(arrive, h2, 0.0, 1.0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float sectors = floor(4.0 + 4.99 * clamp(sectorsP, 0.0, 1.0));
    float a = atan(p.y, p.x) + 0.01 * sceneTime;
    float sec = 3.14159265 / sectors;
    float fa = abs(mod(a, 2.0 * sec) - sec) / sec;              // 0..1 across a mirrored sector
    float r = length(p);
    vec2 cc = vec2(fa * 0.5 * stateRes.x, r * stateRes.y / 1.05);
    vec4 c = texelFetch(texState, ivec2(clamp(cc, vec2(0.0), stateRes - 1.0)), 0);
    float layer = 30.0 + 90.0 * clamp(layerP, 0.0, 1.0);
    float t = c.r;
    float age = stateFrame - t;
    float L = floor(t / layer);
    vec2 uv = p * 0.8 + 0.5;
    vec3 photo = imgLod(uv + vec2(0.29, 0.47) * mod(L, 7.0), 0.7);
    vec3 tone = imgPalette(mod(L, 7.0) / 7.0 + 0.03 * audioPhase);
    float strata = smoothstep(0.0, 0.08, fract(t / layer)) * smoothstep(1.0, 0.92, fract(t / layer));
    vec3 col = mix(photo, tone, 0.35) * (0.35 + 0.65 * strata);
    col += mix(tone, vec3(1.0), 0.5) * exp(-age * 0.15) * (0.6 + 0.9 * clamp(audioKick, 0.0, 1.0));
    finish(col);
}
