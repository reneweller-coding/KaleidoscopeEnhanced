//@doc
 * @brief SILK SPINNING LOOM: hundreds of silk threads weaving themselves into an endless cloth -- the warp running
 * up the frame, the weft shooting across it row after row, every crossing over or under by the weave's pattern
 * (plain, twill, satin), the threads swelling and shading where they bend over each other.  New rows of weft beat in
 * with the music's beat and the cloth rolls on; the threads gently undulate, and the photo dyes them.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBeatPhase  -> the cloth rolls on one row per beat (the beats counted on the state pass: continuous)
 *   audioSectionId  -> each section changes the weave (plain, twill, satin; crossfaded over four seconds)
 *   audioKick       -> the threads' sheen flashes (light)
 *
 * Knobs: threadsP (threads across), sheenP (the silk's sheen), photoP (photo share), hueP.
//@params threadsP sheenP photoP
//@audio audioBeatPhase audioKick audioSectionId audioSectionAge
//@state 1 1 120
//@body
/**  The state pass: counts the beats (wraps of the beat phase).
 *
 * @return
 *   The beats (r), the last beat phase (g), 0, 1.
 **/
vec4 stateStep()
{
    if (stateFrame < 0.5) return vec4(0.0, audioBeatPhase, 0.0, 1.0);
    vec4 c = texelFetch(texState, ivec2(0, 0), 0);
    return vec4(c.r + (audioBeatPhase < c.g - 0.5 ? 1.0 : 0.0), audioBeatPhase, 0.0, 1.0);
}

/**  Whether the warp lies over the weft at a crossing, for a weave.
 *
 * @param i     The warp thread. (in)
 * @param j     The weft row. (in)
 * @param kind  0 plain, 1 twill, 2 satin. (in)
 *
 * @return
 *   1 when the warp is on top.
 **/
float warpOver(float i, float j, int kind)
{
    if (kind == 0) return mod(i + j, 2.0);
    if (kind == 1) return step(1.5, mod(i + j, 4.0));
    return step(mod(i * 2.0 + j, 5.0), 0.5);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float beats = texelFetch(texState, ivec2(0, 0), 0).r + smoothstep(0.0, 0.6, clamp(audioBeatPhase, 0.0, 1.0));
    float n = floor(40.0 + 50.0 * clamp(threadsP, 0.0, 1.0));
    float w = 1.0 / n;
    vec2 q = p + vec2(0.0, beats * w);                          // the cloth rolls on a row a beat
    q += vec2(0.004 * sin(6.0 * q.y + 0.7 * sceneTime), 0.003 * sin(5.0 * q.x - 0.5 * sceneTime));   // undulating
    vec2 g = q / w;
    vec2 cell = floor(g), f = fract(g) - 0.5;
    float k = max(audioSectionId, 0.0);
    float m = audioSectionId < 0.5 ? 1.0 : smoothstep(0.0, 4.0, audioSectionAge);
    float overNow = warpOver(cell.x, cell.y, int(mod(k, 3.0)));
    float overBefore = warpOver(cell.x, cell.y, int(mod(k + 2.0, 3.0)));
    float over = mix(overBefore, overNow, m);
    // the threads' profiles: round across, swelling at the top of each bend
    float warpH = (1.0 - 4.0 * f.x * f.x) * (0.6 + 0.4 * over) * smoothstep(0.5, 0.42, abs(f.x));
    float weftH = (1.0 - 4.0 * f.y * f.y) * (0.6 + 0.4 * (1.0 - over)) * smoothstep(0.5, 0.42, abs(f.y));
    bool warpTop = warpH * (0.5 + over) > weftH * (1.5 - over);
    float hgt = warpTop ? warpH : weftH;
    vec2 nrm = warpTop ? vec2(-8.0 * f.x, 0.0) : vec2(0.0, -8.0 * f.y);
    vec3 nn = normalize(vec3(nrm * 0.25, 1.0));
    float diff = 0.35 + 0.65 * max(dot(nn, normalize(vec3(0.4, 0.5, 0.75))), 0.0);
    float sheen = pow(max(dot(reflect(vec3(0.0, 0.0, -1.0), nn), normalize(vec3(0.4, 0.5, 0.75))), 0.0), 24.0)
                  * (0.2 + 0.8 * clamp(sheenP, 0.0, 1.0)) * (0.6 + 0.6 * clamp(audioKick, 0.0, 1.0));
    float id = warpTop ? cell.x : cell.y + 1000.0;
    vec3 photo = imgLod(warpTop ? vec2(cell.x * w * 0.5 + 0.5, p.y * 0.5 + 0.5) : vec2(p.x * 0.5 + 0.5, cell.y * w * 0.3 + 0.5), 1.0);
    vec3 tone = imgPalette(hash11(id * 0.37) * 0.3 + (warpTop ? 0.0 : 0.5) + 0.03 * audioPhase);
    vec3 col = mix(tone * 1.2, photo * 1.5, 0.5 + 0.45 * clamp(photoP, 0.0, 1.0)) * diff * (0.35 + 0.65 * clamp(hgt, 0.0, 1.0)) + sheen * 0.5;
    finish(col);
}
