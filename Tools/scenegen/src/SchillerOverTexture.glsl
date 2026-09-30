//@doc
 * @brief SCHILLER OVER TEXTURE: the photograph turned into labradorite -- a
 * dark polished stone in which, where the light catches the hidden crystal
 * lamellae, sheets of electric blue, teal, gold and violet flash up out of
 * the dark and slide across the surface as the light wanders.  The
 * lamellae follow the photo's own structure: its bands and grain become
 * the planes that light up, so every photo gives a different stone.  The
 * whole surface stays in motion because the light never stops moving;
 * endless, mirroring without seams.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the light's path across the stone (integrated, jump-free)
 *   audioMode       -> the flash colours: blue-teal in minor, gold-orange in major (slow blend)
 *   audioSpread     -> how narrow the flash angle is (wide spectrum = broader sheets)
 *   audioRoughness  -> the lamellae break into finer domains
 *   audioHigh       -> sparkle in the flashes (light)
 *   audioSwell      -> overall schiller strength (slow)
 *
 * Knobs: scaleP (how close), domainP (size of the crystal domains),
 * darkP (how dark the host stone), hueP.
//@params scaleP domainP darkP
//@audio audioPhase audioMode audioSpread audioRoughness audioHigh audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float swell = clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float sc = 0.7 + 0.8 * clamp(scaleP, 0.0, 1.0);
    vec2 uv = p * sc + 0.5 + vec2(0.004, -0.003) * sceneTime;

    // Host stone: the photo, darkened and cooled.
    vec3 photo = img(mirrorUV(uv));
    float dk = 0.25 + 0.35 * (1.0 - clamp(darkP, 0.0, 1.0));
    vec3 host = mix(vec3(luma(photo)), photo, 0.5) * dk;

    // Lamella orientation: a smooth field (large sheets that bend), broken
    // into finer domains by the roughness, bent further by the photo's own
    // gradient -- no hard cell edges.
    float dsz = 1.2 + 2.0 * clamp(domainP, 0.0, 1.0) + 2.5 * clamp(audioRoughness, 0.0, 1.0);
    vec2 tilt = vec2(fbm(uv * dsz + 3.0), fbm(uv * dsz + 11.0)) * 1.6 - 0.8;
    vec2 g = texGrad(uv, 3.5) * 0.02;
    vec3 n = normalize(vec3(tilt + g, 1.0));
    vec2 bid = floor(uv * dsz * 2.0);
    // The wandering light: it moves on a slow Lissajous path.
    float lp = 0.05 * sceneTime + 0.25 * audioPhase;
    vec3 L = normalize(vec3(0.7 * sin(lp), 0.6 * cos(lp * 0.83), 1.0));
    vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
    float ang = dot(n, H);
    float width = mix(40.0, 16.0, clamp(audioSpread, 0.0, 1.0));
    float flash = pow(max(ang, 0.0), width);
    // Interference colour: the lamella spacing varies with the photo and the
    // domain, so each sheet flashes its own spectral colour.
    float spacing = 0.55 + 0.35 * fbm3(uv * dsz * 1.3 + 7.0) + 0.25 * luma(imgLod(uv, 2.0));
    float mode = clamp(audioMode, 0.0, 1.0);
    // Labradorite runs blue -> teal -> green -> gold -> orange with lamella
    // spacing; minor sits on the blue end, major on the gold end.
    float band = clamp((spacing - 0.55) * 1.4 + (1.0 - ang) * 3.0, 0.0, 1.0);
    float hueS = fract(mix(0.62, 0.3, mode) - band * 0.55 + hueP * 0.04);
    vec3 schC = hsv2rgb(vec3(hueS, 0.85, 1.0));
    // Fine striation inside each flash (the lamellae themselves).
    float stri = 0.8 + 0.2 * sin(fbm3(uv * 18.0) * 30.0);
    vec3 col = host * (1.0 - 0.5 * flash) + schC * flash * stri * (1.3 + 1.0 * swell);
    // Sparkle at the brightest points of the flashes.
    vec2 sq = uv * 260.0, si = floor(sq);
    float sp = step(0.93, hash21(si)) * smoothstep(0.35, 0.0, length(fract(sq) - 0.5));
    col += vec3(1.0) * sp * flash * (0.3 + 1.2 * hi);
    // Polish: a faint broad reflection of the room light.
    col += vec3(0.9, 0.95, 1.0) * 0.05 * pow(max(dot(vec3(g, 1.0) / length(vec3(g, 1.0)), H), 0.0), 8.0);
    finish(col);
}
