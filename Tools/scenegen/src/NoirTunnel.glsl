//@doc
 * @brief NOIR TUNNEL: flying through a black tunnel lit only by slits of light --
 * narrow rings of light rush towards the viewer, each showing a strip of the
 * photograph in silver where it falls on the wall, the louvres between them
 * throw the wall into darkness, and far ahead a single lamp burns at the end
 * of the bore, against which everything stands as a silhouette.  The endless
 * polar field of the Tunnel scene, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the flight (integrated, jump-free)
 *   audioPhase      -> the bore turns (integrated)
 *   audioSpread     -> throat depth
 *   audioRoughness  -> the rings waver (stetig)
 *   audioMode       -> the light's temperature: cold in minor, warm in major (slow blend)
 *   audioHarmChange -> the slits open wider (slow envelope)
 *   audioBass       -> the lamp at the end and the slits glow (light)
 *
 * Knobs: ringsP (slits along the bore), louvreP (louvres around it), photoP (how
 * much the wall shows the photo), lampP (the lamp at the end), hueP (tint).
//@params ringsP louvreP photoP lampP
//@audio audioPhase audioSpread audioRoughness audioMode audioHarmChange audioBass
//@body
void main()
{
    vec2 p = screenP() * 2.4;
    float bass = clamp(audioBass, 0.0, 1.0);
    float r = max(length(p), 1e-3);
    float a = atan(p.y, p.x) + 0.012 * sceneTime + 0.2 * audioPhase;
    float throat = 0.45 * (0.8 + 0.4 * clamp(audioSpread, 0.0, 1.0));
    float z = throat / r;
    float u = z + 0.35 * sceneTime + 1.2 * audioAdvance;
    // Rings of light along the bore; they waver a little with the roughness.
    float nr = 1.2 + 2.2 * clamp(ringsP, 0.0, 1.0);
    float wav = 0.06 * clamp(audioRoughness, 0.0, 1.0) * sin(a * 3.0 + 0.7 * sceneTime);
    float ru = u * nr + wav;
    float open = 0.07 + 0.08 * clamp(audioHarmChange, 0.0, 1.0);
    float rt = abs(fract(ru) - 0.5);                  // 0 on a ring's middle (continuous)
    float fw = fwidth(ru) * 1.5;
    float ring = smoothstep(open + fw, open - fw, rt) + 0.25 * exp(-rt * 18.0);
    // Louvres around the bore: the light comes in stripes (an even count hides the atan cut).
    float nl = 2.0 * floor(6.0 + 10.0 * clamp(louvreP, 0.0, 1.0));
    float lu = a / 6.2831853 * nl;
    float la = abs(fract(lu) - 0.5);
    float louvre = smoothstep(0.12, 0.30, la + 0.08 * smoothstep(0.0, 0.5, rt));
    louvre = mix(louvre, 0.55, smoothstep(0.15, 0.5, fwidth(lu)));   // too fine to show near the end: their mean
    // The wall: the photo wrapped round the bore, in silver.
    float lod = clamp(log2(max(fwidth(u) * 1024.0 * 0.4, 1.0)), 0.0, 8.0);
    vec3 wall = imgLod(vec2(a / 3.14159265 * 2.0, u * 0.4), lod);   // a jump of 4 at the cut: two mirror periods
    float m = luma(imgLod(vec2(0.5), 9.0));
    float silver = mix(0.7, smoothstep(0.3 * m, min(1.8 * m + 0.1, 1.0), luma(wall)), clamp(photoP, 0.0, 1.0));
    vec3 cold = vec3(0.75, 0.84, 1.0), warm = vec3(1.0, 0.84, 0.62);
    vec3 lightC = mix(mix(cold, warm, clamp(audioMode, 0.0, 1.0)), hsv2rgb(vec3(hueP, 0.35, 1.0)), 0.1);
    // Depth: the far rings thin out into darkness, the nearest burn brightest.
    float near = exp(-z * 0.22);
    ring *= 1.0 - smoothstep(0.3, 0.8, fw);                          // rings finer than a pixel fade out
    vec3 col = lightC * ring * louvre * (0.25 + 1.1 * silver) * (0.4 + 0.9 * near) * (0.8 + 0.5 * bass);
    // The lamp at the end of the bore, and the faint light it throws down the walls.
    float lamp = (0.15 + 0.85 * clamp(lampP, 0.0, 1.0)) * (0.8 + 0.5 * bass);
    col += lightC * lamp * (0.035 / (r * r + 0.02) * 0.25 + 0.08 * exp(-r * 1.2) * silver);
    finish(col * 1.3);
}
