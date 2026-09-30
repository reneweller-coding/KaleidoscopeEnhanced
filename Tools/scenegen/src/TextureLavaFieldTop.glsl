//@doc
 * @brief TEXTURE LAVA FIELD TOP: an active lava field seen from straight
 * above at night -- channels and rivers of bright molten rock wind between
 * plates of black cooled crust, the crust split by glowing cracks, fresh
 * lava oozing out as bright lobes that cool from yellow-white to orange to
 * dark red at their edges; the flow creeps along the channels.  The
 * channel network is shaped by the photograph (its dark valleys are where
 * the lava runs).  Faint heat haze and steam drift over it.  Endless,
 * mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the lava creeps along its channels (integrated)
 *   audioBass       -> the glow of the molten rock (light)
 *   audioSpread     -> how much of the field is molten
 *   audioRoughness  -> the crust edges crumble
 *   audioMode       -> temperature: dull red in minor, bright yellow in major
 *   audioSwell      -> steam over the field (slow)
 *
 * Knobs: channelP (channel width), crustP (crack density), steamP, hueP.
//@params channelP crustP steamP
//@audio audioBass audioSpread audioRoughness audioMode audioSwell
//@body
float cracksV(vec2 p)
{
    vec2 i = floor(p), f = fract(p);
    float f1 = 9.0, f2 = 9.0;
    for (int y = -1; y <= 1; ++y) for (int x = -1; x <= 1; ++x) {
        vec2 o = vec2(x, y);
        vec2 c = o + 0.1 + 0.8 * hash22(i + o);
        float d = length(f - c);
        if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
    }
    return f2 - f1;
}

void main()
{
    vec2 p = screenP();
    float bass = clamp(audioBass, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    vec2 uv = p * 0.7 + 0.5 + vec2(0.002, 0.001) * sceneTime;
    float T = 0.08 * sceneTime + 0.6 * audioAdvance;
    // Channels: valleys of the photo (soft), plus noise so every photo flows.
    float lv = luma(imgLod(uv, 5.0)) - luma(imgLod(uv, 7.5));
    float nf = fbm3(p * 1.6 + vec2(0.0, 0.02 * sceneTime));
    float chan = smoothstep(-0.02 - 0.05 * (1.0 - clamp(channelP, 0.0, 1.0)), -0.1, lv + (nf - 0.5) * 0.25 - 0.03 - 0.06 * clamp(audioSpread, 0.0, 1.0));
    // Flow texture inside the channels: streaks creeping along.
    vec2 g = texGrad(uv, 5.5);
    vec2 dir = normalize(vec2(-g.y, g.x) + vec2(0.3, 0.1));
    float along = dot(p, dir) * 8.0 - T * 4.0;
    float streak = 0.6 + 0.4 * fbm3(vec2(along, dot(p, vec2(-dir.y, dir.x)) * 30.0));
    // Crust plates with glowing cracks.
    vec2 cq = p * (5.0 + 5.0 * clamp(crustP, 0.0, 1.0)) + 0.4 * vec2(fbm3(p * 2.0), fbm3(p * 2.0 + 3.0));
    float cr = cracksV(cq);
    float crack = smoothstep(0.06 + 0.04 * rough, 0.0, cr);
    // Cracks glow hot near the molten channels and cool (dark) far from them.
    float heat = smoothstep(0.15, 0.7, fbm3(p * 1.1 + 9.0 + vec2(0.01 * sceneTime, 0.0)) + 0.5 * smoothstep(-0.02, -0.12, lv + (nf - 0.5) * 0.25));
    crack *= heat;
    // Temperature.
    float mode = clamp(audioMode, 0.0, 1.0);
    float t = chan * streak * (0.55 + 0.35 * mode) * (0.8 + 0.4 * bass) * (0.7 + 0.5 * chan) + crack * (1.0 - chan) * 0.45 * (0.7 + 0.6 * bass);
    vec3 col = mix(vec3(0.02, 0.015, 0.015), vec3(0.5, 0.04, 0.0), smoothstep(0.08, 0.3, t));
    col = mix(col, vec3(1.0, 0.35, 0.02), smoothstep(0.3, 0.6, t));
    col = mix(col, vec3(1.0, 0.8, 0.3), smoothstep(0.6, 0.9, t));
    col = mix(col, vec3(1.0, 0.97, 0.85), smoothstep(0.9, 1.2, t));
    col *= 1.5;
    // The crust shows the photo's texture, faintly lit by the glow nearby.
    col += imgLod(uv, 0.5) * 0.06 * (1.0 - chan) * (1.0 + 2.0 * smoothstep(0.3, 0.0, cr));
    col = mix(col, col * glowColour(imgLod(uv, 6.0), p, hueP * 0.159) * 1.4, 0.06);
    // Steam drifting over the field, lit from below by the glow.
    float steam = smoothstep(0.55, 0.85, fbm(p * 1.8 + vec2(0.04 * sceneTime, 0.02 * sceneTime))) * (0.3 + 0.7 * clamp(steamP, 0.0, 1.0)) * (0.5 + 0.7 * swell);
    col = mix(col, vec3(0.5, 0.35, 0.3) * (0.4 + 0.8 * chan), steam * 0.4);
    finish(col);
}
