//@doc
 * @brief NOIR SILVER FLOW: the photograph as liquid silver -- its texture becomes
 * the relief of a slowly flowing metal surface, black in the hollows, catching
 * a wandering light in hard white highlights on every crest, like mercury in
 * a dark room.  The flow never stops and never tears (two phases of the same
 * flow, cross-faded), endless and mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the flow (integrated, jump-free)
 *   audioPhase      -> the light wanders (integrated)
 *   audioSpread     -> the flow's eddies grow
 *   audioRoughness  -> the surface gets finer (detail raised)
 *   audioMode       -> silver cold in minor, warm in major (slow blend)
 *   audioHarmChange -> the light swings round (slow envelope)
 *   audioBass       -> the highlights' strength (light)
 *
 * Knobs: flowP (flow strength), shineP (how hard the highlights are), depthP
 * (relief depth), scaleP (scale), hueP (tint).
//@params flowP shineP depthP scaleP
//@audio audioPhase audioSpread audioRoughness audioMode audioHarmChange audioBass
//@body
/**  The silver surface's height at a photo coordinate: the photo's brightness, levelled to its own mean.
 *
 * @param uv   Photo coordinate. (in)
 * @param lod  Mip level: higher is smoother. (in)
 *
 * @return
 *   Height 0..1.
 **/
float silverHeight(vec2 uv, float lod)
{
    float m = luma(imgLod(vec2(0.5), 9.0));
    return smoothstep(0.25 * m, min(1.9 * m + 0.1, 1.0), luma(imgLod(uv, lod)));
}
void main()
{
    vec2 p = screenP();
    float bass = clamp(audioBass, 0.0, 1.0);
    vec2 uv0 = p * (0.6 + 0.6 * clamp(scaleP, 0.0, 1.0)) + 0.5;
    // The flow field: a slowly turning, eddying field (its own drift keeps it alive).
    vec2 fq = uv0 * (1.5 + 1.2 * clamp(audioSpread, 0.0, 1.0)) + vec2(0.013 * sceneTime, -0.009 * sceneTime);
    vec2 flow = (vec2(fbm3(fq + 1.3), fbm3(fq.yx + 7.1)) - 0.5) * (0.25 + 0.5 * clamp(flowP, 0.0, 1.0));
    // Two phases of the same flow, cross-faded, so the texture never stretches without end.
    float T = 0.04 * sceneTime + 0.15 * audioAdvance;
    float t1 = fract(T), t2 = fract(T + 0.5);
    float wgt = abs(2.0 * t1 - 1.0);
    vec2 uvA = uv0 - flow * t1, uvB = uv0 - flow * t2 + 0.37;
    float lod = mix(2.6, 1.2, clamp(audioRoughness, 0.0, 1.0));
    float h = mix(silverHeight(uvA, lod), silverHeight(uvB, lod), wgt);
    // Normal from the height's slope (the same two phases).
    float e = exp2(lod) / 1024.0 + 0.0015;
    vec2 g = vec2(mix(silverHeight(uvA + vec2(e, 0.0), lod), silverHeight(uvB + vec2(e, 0.0), lod), wgt) - h,
                  mix(silverHeight(uvA + vec2(0.0, e), lod), silverHeight(uvB + vec2(0.0, e), lod), wgt) - h) / e;
    vec3 n = normalize(vec3(-g * (0.004 + 0.012 * clamp(depthP, 0.0, 1.0)), 1.0));
    // A wandering light, low over the surface.
    float la = 0.4 + 0.015 * sceneTime + 0.1 * audioPhase + 0.8 * clamp(audioHarmChange, 0.0, 1.0);
    vec3 L = normalize(vec3(cos(la), sin(la), 0.55));
    vec3 V = vec3(0.0, 0.0, 1.0);
    float diff = max(dot(n, L), 0.0);
    float nh = max(dot(n, normalize(L + V)), 0.0);
    float spec = pow(nh, 10.0 + 50.0 * clamp(shineP, 0.0, 1.0));    // the hard glint
    float sheen = pow(nh, 2.5);                                      // the broad reflection of the room's light
    vec3 cold = vec3(0.80, 0.87, 1.0), warm = vec3(1.0, 0.90, 0.76);
    vec3 metal = mix(mix(cold, warm, clamp(audioMode, 0.0, 1.0)), hsv2rgb(vec3(hueP, 0.3, 1.0)), 0.1);
    // Black hollows, dim body, hard highlights.
    vec3 col = 1.3 * metal * (0.10 * diff * h + 0.7 * sheen * h * h + 1.4 * spec * (0.6 + 0.8 * bass) * (0.3 + 0.7 * h));
    finish(col);
}
