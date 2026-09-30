//@doc
 * @brief TEXTURE SQUARE SHAFT: flying down an endless square shaft whose
 * four walls are lined with the photograph -- the shaft twists slowly
 * around its axis as it goes deeper, so the corners spiral away into the
 * distance; the corners are lit by lines of light with pulses racing
 * along them, square frames of light rush past, and the far end glows.
 * Each wall is shaded by its own angle to a slowly circling light.  The
 * walls continue beyond the frame; mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the flight down the shaft (integrated, jump-free)
 *   audioPhase      -> the shaft's roll (integrated)
 *   audioSpread     -> how strongly the shaft twists with depth
 *   audioKick       -> pulses on the corner lines and frames (light)
 *   audioMode       -> the light: cool in minor, warm in major
 *   audioSwell      -> the glow at the far end (slow)
 *
 * Knobs: twistP, frameP (frame spacing), wallZoomP, hueP.
//@params twistP frameP wallZoomP
//@audio audioPhase audioSpread audioKick audioMode audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float travel = 0.4 * sceneTime + 3.0 * audioAdvance;
    float roll = 0.03 * sceneTime + 0.3 * audioPhase;
    float tw = (0.04 + 0.12 * clamp(twistP, 0.0, 1.0)) * (0.5 + clamp(audioSpread, 0.0, 1.0));
    // Depth by fixed point: the square's rotation depends on its depth.
    float z = 1.0 / max(length(p), 1e-3);
    vec2 r = p;
    for (int i = 0; i < 4; ++i) {
        r = rot2(roll + tw * z) * p;
        z = 0.5 / max(max(abs(r.x), abs(r.y)), 1e-3);
    }
    // Which wall, and where along it: a perimeter coordinate that runs on
    // continuously around the four walls (0..8).
    float per;
    if (abs(r.x) > abs(r.y)) per = r.x > 0.0 ? 1.0 + r.y / abs(r.x) : 5.0 - r.y / abs(r.x);
    else                     per = r.y > 0.0 ? 3.0 - r.x / abs(r.y) : 7.0 + r.x / abs(r.y);
    per = mod(per + 1.0, 8.0);                                   // wall k spans [2k, 2k+2]
    float wall = floor(per * 0.5);                               // (space, not time)
    float s = per - 2.0 * wall - 1.0;                            // -1..1 across the wall
    // The photo on the walls (mirror period 2 -> the wrap at 8 is seamless).
    float wz = 0.3 + 0.5 * clamp(wallZoomP, 0.0, 1.0);
    vec2 uv = vec2(per * 0.5, (z + travel) * wz);              // 8 * 0.5 = 4: whole mirror periods
    float fwP = min(fwidth(per), fwidth(mod(per + 4.0, 8.0)));
    float fw = max(fwP * 0.5, fwidth(z) * wz) * 1024.0;
    vec3 wallC = imgLod(uv, clamp(log2(max(fw, 1.0)), 0.0, 9.0));
    // Wall shading from a slowly circling light.
    float wa = wall * 1.5707963 + roll;
    float lightA = 0.2 * sceneTime;
    float shade = 0.7 + 0.35 * cos(wa - lightA);
    float mode = clamp(audioMode, 0.0, 1.0);
    vec3 lc = mix(vec3(0.6, 0.8, 1.1), vec3(1.15, 0.85, 0.55), mode);
    vec3 glowC = glowColour(imgLod(vec2(0.5 + 0.1 * sin(0.02 * sceneTime), 0.5), 6.0), vec2(travel * 0.05, 0.0), hueP * 0.159);
    vec3 col = wallC * shade * lc * 1.2;
    // Corner lines with pulses racing along.
    float px = fwP * 1.5 + 1e-4;
    float corner = exp(-pow((1.0 - abs(s)) / px, 2.0) * 0.5);
    float pulse = pow(0.5 + 0.5 * sin((z + travel) * 1.5 - 4.0 * sceneTime + wall * 1.3), 8.0);
    col += glowC * corner * (0.4 + (1.0 + 1.5 * kick) * pulse);
    // Frames of light every few units.
    float fs = 0.8 + 1.6 * clamp(frameP, 0.0, 1.0);
    float fz = (z + travel) / fs;
    float fd = abs(fract(fz) - 0.5) * 2.0;                     // 1 at a frame
    float frame = smoothstep(1.0 - fwidth(fz) * 3.0, 1.0, fd);
    col += mix(glowC, vec3(1.0), 0.3) * frame * (0.5 + 1.2 * kick);
    // Depth fog to the glowing end.
    float fog = exp(-z * 0.18);
    vec3 endC = glowC * (0.25 + 0.6 * swell);
    col = mix(endC, col, fog);
    col += endC * exp(-length(p) * 12.0) * 1.5;
    finish(col);
}
