//@doc
 * @brief TEXTURE COMET SHOWER: a shower of comets across a starry night --
 * bright heads streak diagonally over the sky trailing long curved tails
 * that fan out and fade, some tails split into a straight blue ion tail
 * and a curved golden dust tail; the sky behind is the photograph turned
 * into a deep night with faint stars, and the heads take their colours
 * from it.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the comets fly (integrated, jump-free)
 *   audioSpread     -> tail length
 *   audioKick       -> the heads flare (light)
 *   audioMode       -> palette: icy blue in minor, golden in major
 *   audioHigh       -> the stars twinkle (light)
 *   audioSwell      -> the sky's glow (slow)
 *
 * Knobs: densityP (comets), angleP (flight direction), skyP (photo in the sky), hueP.
//@params densityP angleP skyP
//@audio audioSpread audioKick audioMode audioHigh audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    vec2 uv = p * 0.5 + 0.5 + vec2(0.002, 0.0) * sceneTime;
    vec3 sky = imgLod(uv, 3.0);
    sky = mix(vec3(0.01, 0.015, 0.04), sky * vec3(0.12, 0.14, 0.25), 0.3 + 0.5 * clamp(skyP, 0.0, 1.0)) * (0.7 + 0.6 * swell);
    vec3 col = sky;
    // Stars: round, twinkling.
    vec2 sg = p * 70.0;
    vec2 si = floor(sg);
    float st = smoothstep(0.25, 0.0, length(fract(sg) - 0.25 - 0.5 * hash22(si))) * step(0.94, hash21(si + 1.0));
    col += vec3(0.8, 0.85, 1.0) * st * (0.3 + 0.4 * sin(sceneTime * (1.0 + hash21(si)) + hash21(si + 2.0) * 30.0) * hi + 0.2);
    // Comets: lanes along the flight direction.
    float ang = -0.5 - 0.6 * clamp(angleP, 0.0, 1.0);
    vec2 dir = vec2(cos(ang), sin(ang));
    vec2 nrm = vec2(-dir.y, dir.x);
    float along = dot(p, dir), across = dot(p, nrm);
    float laneW = 0.12 - 0.06 * clamp(densityP, 0.0, 1.0);
    float li = floor(across / laneW);
    float tailL = 0.3 + 0.5 * clamp(audioSpread, 0.0, 1.0);
    float fly = 0.4 * sceneTime + 2.5 * audioAdvance;
    vec3 ice = vec3(0.6, 0.85, 1.0), gold = vec3(1.0, 0.8, 0.4);
    for (int k = -1; k <= 1; ++k) {
        float lane = li + float(k);
        float h = hash11(lane * 0.37 + 4.0);
        if (h > 0.6) continue;
        float spd = 0.6 + 0.6 * hash11(lane * 1.3);
        float period = 3.5;
        float hx = mod(fly * spd + h * 10.0, period) - period * 0.5;   // head position along the lane
        float c0 = (lane + 0.5 + 0.3 * (hash11(lane * 2.1) - 0.5)) * laneW;
        float da = along - hx * 1.4;                            // behind the head: da < 0
        float dc = across - c0;
        // Dust tail curves away from the lane; ion tail straight.
        float behind = max(-da, 0.0);
        float curveOff = 0.15 * behind * behind * (h - 0.3);
        float spread = 0.004 + 0.06 * behind / tailL;
        float dust = exp(-pow((dc - curveOff) / spread, 2.0)) * exp(-behind / tailL) * step(da, 0.0);
        float ion = exp(-pow(dc / (0.002 + 0.01 * behind), 2.0)) * exp(-behind / (tailL * 1.5)) * step(da, 0.0);
        float head = exp(-(da * da + dc * dc) / 0.00008);
        float fade = smoothstep(period * 0.5, period * 0.35, abs(hx));   // appear and vanish smoothly at the lane ends
        vec3 hc = glowColour(imgLod(vec2(h, fract(h * 7.0)), 4.0), vec2(lane, 0.0), hueP * 0.159);
        vec3 dustC = mix(mix(ice, gold, mode), hc, 0.3);
        col += (dustC * dust * 0.8 + ice * ion * 0.6 + vec3(1.0) * head * (1.5 + 2.5 * kick)) * fade;
    }
    finish(col);
}
