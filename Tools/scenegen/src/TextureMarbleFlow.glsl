//@doc
 * @brief TEXTURE MARBLE FLOW: polished marble that has not quite set -- the
 * photograph becomes the stone's body, its colours clouded and veined, and
 * the veins (white, gold or dark) flow slowly through it in folded
 * streams, like the stone still remembered being molten; a soft polish
 * reflection glides over the surface.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the stone flows (integrated, jump-free)
 *   audioSpread     -> vein folding (turbulence)
 *   audioKick       -> the gold veins glint (light)
 *   audioMode       -> veins: white/grey in minor, gold in major
 *   audioRoughness  -> fine crackle veins
 *   audioSwell      -> the polish reflection (slow)
 *
 * Knobs: veinP (vein density), cloudP (clouding of the photo), polishP, hueP.
//@params veinP cloudP polishP
//@audio audioSpread audioKick audioMode audioRoughness audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    float T = 0.02 * sceneTime + 0.15 * audioAdvance;
    float turb = 0.6 + 1.0 * clamp(audioSpread, 0.0, 1.0);
    vec2 q = p * 1.5;
    vec2 w1 = vec2(fbm(q + vec2(T, 0.0)), fbm(q + vec2(3.1, 7.7) - vec2(0.0, T))) - 0.5;
    vec2 w2 = vec2(fbm(q * 1.6 + turb * w1 * 2.0 + vec2(1.3, 4.1)), fbm(q * 1.6 + turb * w1 * 2.0 + vec2(8.1, 2.2))) - 0.5;
    vec2 wq = q + turb * w2 * 1.2;
    // The body: the photo seen through the flow, clouded.
    vec2 uv = p * 0.5 + 0.5 + 0.12 * w2 + vec2(0.002, 0.001) * sceneTime;
    vec3 body = imgLod(uv, 1.5 + 2.5 * clamp(cloudP, 0.0, 1.0));
    body = mix(body, vec3(luma(body)), 0.35);
    body = body * 0.75 + 0.18;
    // Veins: thin isolines of the warped field.
    float vd = 3.0 + 5.0 * clamp(veinP, 0.0, 1.0);
    float v = sin(wq.x * vd + wq.y * vd * 0.3 + 4.0 * fbm3(wq));
    float vpx = fwidth(v) + 1e-4;
    float vein = exp(-abs(v) / (vpx * 1.5 + 0.03));
    float vein2 = exp(-abs(sin(wq.y * vd * 2.3 - wq.x * 0.7 + 3.0 * fbm3(wq * 2.0 + 5.0))) / 0.02) * 0.5;
    float crackle = exp(-abs(fbm(wq * 6.0) - 0.5) / 0.012) * rough * 0.6;
    float mode = clamp(audioMode, 0.0, 1.0);
    vec3 veinC = mix(vec3(0.95, 0.95, 0.97), vec3(1.0, 0.78, 0.35), mode);
    veinC = mix(veinC, glowColour(imgLod(uv, 5.0), p, hueP * 0.159), 0.15);
    vec3 col = body;
    col = mix(col, veinC * (1.0 + 0.8 * kick * mode), clamp(vein * 0.85 + vein2 * 0.4, 0.0, 1.0));
    col = mix(col, col * 0.45, crackle);
    // Polish: a soft reflection band gliding over the stone.
    float pol = exp(-pow(dot(p, normalize(vec2(1.0, 0.6))) - 0.8 * sin(0.03 * sceneTime), 2.0) * 6.0);
    col += vec3(1.0, 0.98, 0.95) * pol * (0.05 + 0.2 * clamp(polishP, 0.0, 1.0)) * (0.5 + swell);
    finish(col);
}
