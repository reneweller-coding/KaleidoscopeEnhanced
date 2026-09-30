//@doc
 * @brief TEXTURE LATTICE TUNNEL: flying through a tube built of a steel
 * lattice -- diagonal girders crossing in a diamond pattern, their joints
 * studded with lights -- and through the gaps between the girders the
 * photograph shines, lining a wider tunnel further out that moves past
 * at its own slower pace (parallax); the lattice twists slowly as we go.
 * Endless, mirrorable; the tunnel continues beyond the frame.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the flight (integrated, jump-free)
 *   audioPhase      -> the lattice twists (integrated)
 *   audioSpread     -> girder spacing (open lattice when wide)
 *   audioKick       -> the joint lights flare (light)
 *   audioMode       -> light colour: cool in minor, warm in major
 *   audioSwell      -> depth glow (slow)
 *
 * Knobs: girderP (girder width), countP (girders around), outerP (outer tunnel brightness), hueP.
//@params girderP countP outerP
//@audio audioPhase audioSpread audioKick audioMode audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float r = max(length(p), 1e-4);
    float a = atan(p.y, p.x);
    float travel = 0.6 * sceneTime + 3.5 * audioAdvance;
    float twist = 0.03 * sceneTime + 0.3 * audioPhase;
    vec2 cs = vec2(cos(a), sin(a));
    vec2 cfw = fwidth(cs);
    float fwA = length(cfw);
    // Inner lattice at radius 1 (depth z1), outer wall at radius 2.2 (z2).
    float z1 = 0.5 / r;
    float z2 = 1.1 / r;
    float M = 2.0 * floor(4.0 + 4.0 * clamp(countP, 0.0, 1.0));     // girders around (even)
    float pitch = (0.5 + 0.5 * clamp(audioSpread, 0.0, 1.0)) * 6.2831853 / M;
    // Lattice coordinates: (angle, depth) in units where girders run diagonally.
    float u = (a + twist) * M / 6.2831853;                    // one unit per girder spacing around
    float v = (z1 + travel) / (pitch * 2.0);
    vec2 g1 = vec2(u + v, u - v);                              // the two diagonal families
    vec2 f1 = abs(fract(g1) - 0.5);                            // 0.5 at the girders' centres
    float pxU = fwA * M / 6.2831853 + fwidth(v) + 1e-4;
    float gw = 0.05 + 0.08 * clamp(girderP, 0.0, 1.0);
    float gir = max(smoothstep(0.5 - gw - pxU, 0.5 - gw + pxU, f1.x), smoothstep(0.5 - gw - pxU, 0.5 - gw + pxU, f1.y));
    // Joints where the two families cross.
    vec2 jn = abs(fract(g1 + 0.5) - 0.5);
    float jd = length(jn);
    float joint = smoothstep(0.12 + pxU, 0.12 - pxU, jd);
    // Outer tunnel: the photo, moving slower (further away).
    vec2 ouv = vec2(a / 3.14159265, (z2 + travel * 0.6) * 0.25);
    float fw = max(fwA / 3.14159265, fwidth(z2) * 0.25) * 1024.0;
    vec3 outer = imgLod(ouv, clamp(log2(max(fw, 1.0)), 0.0, 9.0)) * (0.5 + 0.8 * clamp(outerP, 0.0, 1.0));
    float mode = clamp(audioMode, 0.0, 1.0);
    vec3 lc = mix(vec3(0.6, 0.8, 1.1), vec3(1.15, 0.85, 0.55), mode);
    vec3 gc = glowColour(imgLod(vec2(0.5 + 0.1 * sin(0.02 * sceneTime), 0.5), 6.0), vec2(travel * 0.03, 0.0), hueP * 0.159);
    outer *= exp(-z2 * 0.1);
    // Girders: dark steel, lit edges.
    float edgeLit = max(smoothstep(0.5 - gw - pxU * 3.0, 0.5 - gw, f1.x) * (1.0 - smoothstep(0.5 - gw, 0.5 - gw + pxU * 3.0, f1.x)),
                        smoothstep(0.5 - gw - pxU * 3.0, 0.5 - gw, f1.y) * (1.0 - smoothstep(0.5 - gw, 0.5 - gw + pxU * 3.0, f1.y)));
    vec3 steel = vec3(0.08, 0.085, 0.09) * lc + lc * edgeLit * 0.35;
    steel *= exp(-z1 * 0.12);
    vec3 col = mix(outer, steel, gir);
    // Joint lights, a pulse running along the tunnel.
    float pulse = pow(0.5 + 0.5 * sin((z1 + travel) * 0.8 - 3.0 * sceneTime), 6.0);
    col = mix(col, gc * (0.7 + (0.8 + 1.8 * kick) * pulse), joint * exp(-z1 * 0.08));
    col += gc * exp(-jd * 6.0) * 0.15 * (0.5 + pulse) * exp(-z1 * 0.1);
    // Depth glow.
    float fog = exp(-z1 * 0.1);
    col = mix(gc * (0.12 + 0.5 * swell), col, fog);
    col += gc * exp(-r * 14.0) * (0.4 + swell);
    finish(col);
}
