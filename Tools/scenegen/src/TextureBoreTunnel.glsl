//@doc
 * @brief TEXTURE BORE TUNNEL: a drill bore through the photograph -- the
 * tunnel's wall IS the texture, raised into a relief whose ridges and
 * grooves catch the light of a lamp travelling with the camera, rifled by
 * helical grooves, and far ahead the exit glows.  Like the original Tunnel
 * the picture is an endless polar field: it continues past the frame edges
 * and mirrors without seams, and every photo of the pool gives a different
 * bore (meteorite iron, basalt, felt, glaze ...).
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the forward drive (integrated, jump-free)
 *   audioPhase      -> slow roll of the bore (integrated)
 *   audioSpread     -> throat depth: how steeply the wall runs to the exit
 *   audioMode       -> cross-section: round in minor, squarer in major
 *   audioRoughness  -> the wall ripples along the radius
 *   audioRolloff    -> colour temperature of the lamp
 *   audioBass       -> the glow of the exit (light)
 *   audioHigh       -> glints on the ridges (light)
 *   audioSwell      -> the lamp's reach (slow)
 *
 * Knobs: sidesP (texture repeats around the wall), twistP (rifling twist),
 * reliefP (relief depth), hueP.
//@params sidesP twistP reliefP
//@audio audioPhase audioSpread audioMode audioRoughness audioRolloff audioBass audioHigh audioSwell
//@expr reliefP = clamp(0.35 + 0.4*swell + 0.15*seed2, 0.0, 1.0)
//@body
void main()
{
    vec2 p = screenP() * 4.0;
    float swell = clamp(audioSwell, 0.0, 1.0);
    float bass = clamp(audioBass, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);

    // Cross-section: a superellipse between circle and rounded square.
    float powV = mix(1.0, 2.2, clamp(audioMode, 0.0, 1.0));
    float r = pow(pow(abs(p.x), 2.0 * powV) + pow(abs(p.y), 2.0 * powV), 1.0 / (2.0 * powV));
    float a = atan(p.y, p.x) + 0.02 * sceneTime + 0.35 * audioPhase;

    // Depth along the bore and the angle around it.
    float throat = 0.55 * (0.8 + 0.4 * clamp(audioSpread, 0.0, 1.0));
    float z = throat / max(r, 1e-3);
    float k = 2.0 * (1.0 + floor(clamp(sidesP, 0.0, 0.999) * 4.0));   // 2,4,6,8 repeats around
    float u = z + 0.35 * sceneTime + audioAdvance;
    float v = a / 6.2831853 * k + 0.035 * rough * sin(r * 7.5);
    vec2 tuv = vec2(v, u * 1.4);

    // Mip level from the footprint, so the far wall never shimmers.
    // (the angle jumps at the branch cut, so its footprint comes from cos/sin)
    float da = length(fwidth(vec2(cos(a), sin(a))));
    float fp = max(da * k / 6.2831853, fwidth(tuv.y)) * 1024.0;
    float lod = clamp(log2(max(fp, 1.0)), 0.0, 9.0);
    vec3 wall = imgScroll(tuv, lod);
    // Relief: height and gradient from the photo; the lamp sits at the camera,
    // so light falls on the wall from the tunnel axis.
    float relief = 0.3 + 1.2 * clamp(reliefP, 0.0, 1.0);
    vec2 g = texGrad(tuv, lod + 1.5) * 0.02 * relief;
    vec3 n = normalize(vec3(-g.x, -g.y, 1.0));
    vec3 L = normalize(vec3(0.35 * sin(sceneTime * 0.05), 0.6, 1.0));
    float dif = 0.35 + 0.65 * max(dot(n, L), 0.0);
    float spec = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 24.0);

    // Rifling: helical grooves twisting down the bore.
    float twist = mix(-1.5, 1.5, clamp(twistP, 0.0, 1.0));
    float rifle = 0.5 + 0.5 * cos((v * 6.2831853 / k * 6.0) + u * twist * 6.2831853);
    float groove = smoothstep(0.75, 1.0, rifle);
    float rifleAA = smoothstep(0.6, 0.15, fwidth(u * twist) + 0.02);

    // The lamp's reach: the wall fades into darkness with depth, then the exit glows.
    float reach = exp(-z * mix(1.1, 0.7, swell));
    float h = texHeight(tuv, lod + 2.0, 0.4);
    vec3 lampC = mix(vec3(0.75, 0.85, 1.1), vec3(1.15, 0.95, 0.75), clamp(audioRolloff, 0.0, 1.0));
    // Coloured light: the wall takes a hue from the photo (or a wandering hue
    // field where the photo is grey), strongest in the lit ridges.
    lampC *= mix(vec3(1.0), glowColour(imgLod(tuv, 6.0), vec2(cos(a), sin(a)) * 0.9 + vec2(u * 0.05, 0.0), hueP * 0.159) * 1.4, 0.45);
    vec3 col = wall * dif * lampC * reach * (1.0 - 0.45 * groove * rifleAA) * (0.55 + 0.6 * h);
    col += vec3(1.0, 0.95, 0.85) * spec * reach * (0.25 + 0.9 * hi) * rifleAA;
    // The exit: a glow at the vanishing point, coloured by the photo.
    vec3 exitC = mix(vec3(1.0, 0.8, 0.55), imgPalette(0.1 + hueP * 0.159) * 1.4, 0.5);
    col += exitC * exp(-r * 2.2) * (0.5 + 1.0 * bass);
    finish(col);
}
