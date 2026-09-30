//@doc
 * @brief WATERFALL TUNNEL: flying down a tunnel whose walls are falling
 * water -- sheets of water stream along the walls toward us, the
 * photograph behind them smeared and rippling through the flow, foam
 * streaks and white spray lines racing past, droplets glinting, and a
 * bright mist glowing at the far end.  The water keeps flowing even when
 * the flight slows.  Endless, mirrorable; the walls continue beyond the
 * frame.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the flight (integrated, jump-free)
 *   audioSpread     -> the water flows faster and wilder
 *   audioKick       -> the spray flashes (light)
 *   audioMode       -> the water: cold glacial in minor, warm sunlit in major
 *   audioHigh       -> droplets glint (light)
 *   audioSwell      -> the mist at the end (slow)
 *
 * Knobs: foamP (foam streaks), clarityP (how clearly the photo shows), twistP (the flow spirals), hueP.
//@params foamP clarityP twistP
//@audio audioSpread audioKick audioMode audioHigh audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float r = max(length(p), 1e-4);
    float a = atan(p.y, p.x);
    vec2 cs = vec2(cos(a), sin(a));
    float z = 0.5 / r;
    float travel = 0.3 * sceneTime + 2.5 * audioAdvance;
    float flow = (0.8 + 0.8 * clamp(audioSpread, 0.0, 1.0)) * sceneTime;   // the water's own fall
    float tw = (0.2 + 0.6 * clamp(twistP, 0.0, 1.0)) * sin(0.02 * sceneTime);
    float wz = z + travel + flow;
    // Angle as a point on the circle (no seam); spiral twist along depth.
    vec2 ang = rot2(tw * z) * cs;
    // Flow streaks: noise stretched along the depth.
    float streak = fbm(vec2(ang * 3.0) + vec2(wz * 0.15, 0.0)) ;
    float streak2 = noise2(ang * 14.0 + vec2(wz * 0.4, 3.0));
    // The photo behind the water: smeared along the flow and rippling.
    vec2 rip = vec2(fbm3(vec2(wz * 0.8, 0.0) + ang * 4.0), fbm3(vec2(wz * 0.8, 5.0) + ang * 4.0)) - 0.5;
    float clar = clamp(clarityP, 0.0, 1.0);
    vec2 uv = vec2(atan(ang.y, ang.x) / 3.14159265, (z + travel) * 0.25) + rip * (0.12 - 0.08 * clar);
    vec2 cfw = fwidth(cs);
    float fw = max(length(cfw) / 3.14159265, fwidth(z) * 0.25) * 1024.0;
    vec3 behind = imgLod(uv, clamp(log2(max(fw, 1.0)) + 1.5 - clar, 0.0, 9.0));
    vec3 waterC = mix(vec3(0.6, 0.85, 1.0), vec3(0.95, 0.9, 0.75), mode);
    vec3 col = behind * waterC * (0.6 + 0.4 * streak);
    // Foam: white streaks racing along.
    float foam = smoothstep(0.6 - 0.2 * clamp(foamP, 0.0, 1.0), 0.85, streak * 0.6 + streak2 * 0.5);
    col = mix(col, vec3(0.92, 0.96, 1.0) * waterC, foam * 0.7);
    col += waterC * pow(streak2, 8.0) * (0.2 + 0.6 * kick);
    // Droplet glints (round, in angle-depth space).
    vec2 dg = vec2(a / 6.2831853 * 60.0, wz * 3.0);
    vec2 di = floor(dg), df = fract(dg);
    di.x = mod(di.x, 60.0);
    float gl = smoothstep(0.3, 0.0, length(df - 0.25 - 0.5 * hash22(di))) * step(0.9, hash21(di + 3.0));
    col += vec3(1.0) * gl * (0.2 + 1.2 * hi) * exp(-z * 0.2);
    // Mist at the far end.
    vec3 gc = glowColour(imgLod(vec2(0.5), 6.0), vec2(travel * 0.02, 0.0), hueP * 0.159);
    vec3 mist = mix(waterC, gc, 0.3) * (0.3 + 0.6 * swell);
    float fog = exp(-z * 0.15);
    col = mix(mist, col, fog);
    col += mist * exp(-r * 10.0) * 1.2;
    finish(col);
}
