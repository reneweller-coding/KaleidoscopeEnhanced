//@doc
 * @brief IKEDA DATA STREAMS: a data-art cascade in the spirit of Ryoji Ikeda
 * -- the whole view is ruled into horizontal lanes of racing barcodes,
 * binary strips and thin bars flickering at different speeds and
 * resolutions, black and white with rare accents of colour; the lanes'
 * density and brightness are driven by the photograph scanned line by
 * line, so its picture emerges ghostlike from the data flood.  Endless,
 * mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the data streams (integrated, jump-free)
 *   audioSpread     -> the lane count
 *   audioKick       -> the whole field flashes inverse (light)
 *   audioMode       -> white on black in minor, black on white in major (blend)
 *   audioHigh       -> the fine bars sparkle (light)
 *   audioRoughness  -> the lanes jitter in speed
 *
 * Knobs: laneP (lane height variety), photoP (how much the photo shapes the data), accentP (colour accents), hueP.
//@params laneP photoP accentP
//@audio audioSpread audioKick audioMode audioHigh audioRoughness
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float mode = smoothstep(0.45, 0.55, clamp(audioMode, 0.0, 1.0));   // short flip, no long grey blend
    float rough = clamp(audioRoughness, 0.0, 1.0);
    float nL = 20.0 + 40.0 * clamp(audioSpread, 0.0, 1.0);
    // Lanes of varying height: warp y with a stepped-free noise so lanes differ.
    float y = p.y * nL + clamp(laneP, 0.0, 1.0) * 3.0 * fbm3(vec2(p.y * 3.0, 1.0));
    float lane = floor(y);
    float ly = fract(y);
    float h = hash11(lane * 0.731 + 3.0);
    float speed = (0.5 + 3.0 * h * h) * (h > 0.5 ? 1.0 : -1.0) * (1.0 + rough * 0.5 * sin(0.3 * sceneTime + h * 9.0));
    float res = 40.0 + 400.0 * hash11(lane * 1.9);              // bars per unit
    float T = 0.5 * sceneTime + 3.0 * audioAdvance;
    float x = (p.x + T * speed * 0.1) * res;
    float bi = floor(x);
    // The photo, scanned: the lane's brightness at this x decides the bar density.
    vec2 uv = vec2(p.x * 0.5 + 0.5, (lane + 0.5) / nL * 0.5 + 0.5);
    float lum = luma(imgLod(uv, 2.0));
    float thr = mix(0.5, 1.0 - lum, clamp(photoP, 0.0, 1.0));
    float bar = step(thr, hash21(vec2(bi, lane)));
    // Some lanes are solid thin lines, some binary blocks, some fine bars.
    float kind = hash11(lane * 3.3);
    if (kind > 0.85) bar = step(0.5, ly) * step(ly, 0.6);   // a hairline
    // Anti-alias fine bars toward their mean.
    float px = fwidth(x);
    bar = mix(bar, 1.0 - thr, smoothstep(0.5, 1.5, px));
    // Gaps between lanes.
    bar *= smoothstep(0.0, 0.08, ly) * smoothstep(1.0, 0.92, ly);
    // Sparkle on fine bars.
    bar += hi * step(0.995, hash21(vec2(bi, lane + 0.5))) * 0.5;
    vec3 fg = vec3(1.0), bg = vec3(0.0);
    vec3 col = mix(mix(bg, fg, bar), mix(fg, bg, bar) * 0.95, mode);
    // Rare colour accents on some lanes.
    float acc = step(1.0 - 0.1 * clamp(accentP, 0.0, 1.0), hash11(lane * 7.1));
    vec3 ac = glowColour(imgLod(uv, 4.0), vec2(lane, 0.0), hueP * 0.159);
    col = mix(col, ac * bar, acc);
    // Kick: an inverse flash rolling down the screen.
    float flash = kick * exp(-pow(p.y + 0.6 - fract(0.5 * sceneTime) * 1.2, 2.0) * 30.0);
    col = mix(col, vec3(1.0) - col, clamp(flash, 0.0, 1.0));
    finish(col);
}
