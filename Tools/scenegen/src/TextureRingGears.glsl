//@doc
 * @brief TEXTURE RING GEARS: an endless clockwork of meshing gears -- gear
 * wheels of many sizes, cut from the photograph like enamelled brass
 * plates, interlock across the whole view, each turning at the speed its
 * tooth count demands (big ones slow, small ones fast, neighbours in
 * opposite directions), with spokes, hubs and a polished rim; the
 * mechanism never stops.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the gears turn (integrated, jump-free)
 *   audioSpread     -> the gear scale
 *   audioKick       -> the rims flash (light)
 *   audioMode       -> metal: steel in minor, brass in major
 *   audioSwell      -> the enamel colour (slow)
 *   audioHigh       -> glints on the teeth (light)
 *
 * Knobs: toothP (tooth count), spokeP (spoke count), enamelP (photo enamel), hueP.
//@params toothP spokeP enamelP
//@audio audioSpread audioKick audioMode audioSwell audioHigh
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float S = 3.0 + 2.0 * clamp(audioSpread, 0.0, 1.0);
    // Gears on a checkerboard: every cell a gear; neighbours mesh and turn opposite.
    vec2 g = p * S;
    vec2 gi = floor(g);
    vec2 l = fract(g) - 0.5;
    float parity = mod(gi.x + gi.y, 2.0);
    float dir = parity < 0.5 ? 1.0 : -1.0;
    float teeth = 2.0 * floor(6.0 + 6.0 * clamp(toothP, 0.0, 1.0));
    float T = 0.3 * sceneTime + 2.0 * audioAdvance;
    // Offset of half a tooth on the odd gears so the teeth mesh.
    float ang = atan(l.y, l.x) + dir * T / teeth * 6.0 + parity * 3.14159265 / teeth;
    float r = length(l);
    float R = 0.5;                                              // pitch radius: neighbours mesh
    float tooth = 0.05 * smoothstep(-0.3, 0.3, cos(ang * teeth));
    float outer = R - 0.028 + tooth;
    float px = fwidth(g.x) * 1.2;
    float body = smoothstep(outer + px, outer - px, r);
    // Spokes and hub.
    float ns = floor(3.0 + 4.0 * clamp(spokeP, 0.0, 1.0));
    float sa = abs(fract(ang * ns / 6.2831853) - 0.5) * 6.2831853 / ns * r;
    float spoke = smoothstep(0.035 + px, 0.035 - px, sa);
    float rimBand = smoothstep(0.3 - px, 0.3 + px, r);
    float hub = smoothstep(0.1 + px, 0.1 - px, r);
    float solid = body * max(max(rimBand, spoke), hub);
    // Enamel inside: the photo, turning with the gear.
    vec2 luv = rot2(-(dir * T / teeth * 6.0)) * l;
    vec2 uv = (gi + 0.5) / S * 0.6 + 0.5 + luv * 0.3;
    vec3 ph = imgK(uv, 1.0);
    vec3 metal = mix(vec3(0.6, 0.62, 0.66), vec3(0.85, 0.62, 0.3), mode);
    vec3 enamel = mix(metal * (0.5 + 0.6 * luma(ph)), glowColour(ph, gi, hueP * 0.159) * (0.5 + 0.5 * luma(ph)), clamp(enamelP, 0.0, 1.0) * (0.5 + 0.5 * swell));
    // The windows between the spokes show the enamel; the solid parts are metal.
    vec3 col = vec3(0.02, 0.02, 0.025) + imgLod(p * 0.5 + 0.5, 5.0) * 0.04;
    col = mix(col, enamel * 0.8, body * (1.0 - solid));
    vec3 metC = metal * (0.55 + 0.45 * sin(ang * 2.0 + 1.0) * 0.5 + 0.25);
    col = mix(col, metC, solid);
    // Rim polish and teeth glints.
    float rimLine = exp(-abs(r - outer + 0.01) / (px * 1.5)) * body;
    col += mix(metal, vec3(1.0), 0.5) * rimLine * (0.2 + 0.8 * kick);
    col += vec3(1.0) * pow(max(0.0, cos(ang * teeth)), 30.0) * smoothstep(outer - 0.03, outer, r) * body * hi * 0.6;
    // Axle.
    col = mix(col, vec3(0.05), smoothstep(0.035, 0.025, r));
    finish(col);
}
