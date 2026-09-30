//@doc
 * @brief HOT WAX BLOBS TOP: looking down into a giant lava lamp -- soft,
 * glowing blobs of coloured wax rise toward us, grow, merge and pull apart
 * in the warm liquid, their centres bright where they are closest and
 * their edges dark and translucent, lit from below so the whole lamp
 * glows; the blobs' colours come from the photograph.  Endless,
 * mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the blobs rise and drift (integrated, jump-free)
 *   audioSpread     -> blob size
 *   audioBass       -> the lamp glows brighter (light)
 *   audioMode       -> the liquid: blue in minor, amber in major
 *   audioRoughness  -> the blob surfaces wobble
 *   audioSwell      -> blob merging (slow)
 *
 * Knobs: blobP (blob count), glowP (glow strength), photoP (photo colours), hueP.
//@params blobP glowP photoP
//@audio audioSpread audioBass audioMode audioRoughness audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float bass = clamp(audioBass, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    float T = 0.06 * sceneTime + 0.4 * audioAdvance;
    vec3 liquid = mix(vec3(0.05, 0.12, 0.3), vec3(0.35, 0.15, 0.03), mode);
    vec3 col = liquid * (0.5 + 0.5 * bass) * (0.7 + 0.3 * fbm3(p * 1.5 + T));
    // Blobs: metaballs on a drifting jittered grid, their heights (nearness) cycling.
    float S = 1.6 + 1.2 * clamp(blobP, 0.0, 1.0);
    vec2 g = p * S + vec2(0.3 * T, 0.2 * T);
    vec2 gi = floor(g);
    float F = 0.0; vec3 C = vec3(0.0); float H = 0.0;
    float R = (0.3 + 0.15 * clamp(audioSpread, 0.0, 1.0)) * (0.9 + 0.3 * swell);
    for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
        vec2 id = gi + vec2(i, j);
        float h = hash21(id);
        vec2 c = id + 0.5 + 0.3 * vec2(sin(T * (0.8 + 0.4 * h) + h * 6.28), cos(T * (0.7 + 0.4 * h) + h * 9.0));
        // Rising toward us: the blob swells and brightens, then sinks away (continuous).
        float rise = 0.5 + 0.5 * sin(T * (0.6 + 0.5 * h) + h * 12.0);
        vec2 d = g - c;
        float ang = atan(d.y, d.x);
        vec2 u = vec2(cos(ang), sin(ang));
        float rr = R * (0.6 + 0.6 * rise) * (1.0 + (0.05 + 0.1 * rough) * (fbm3(u * 2.0 + h * 10.0 + T) - 0.5));
        float m = exp(-dot(d, d) / (rr * rr));
        F += m;
        vec3 pc = glowColour(imgLod(hash22(id + 3.0), 4.0), id, hueP * 0.159 + h * 0.4);
        pc = mix(mix(vec3(1.0, 0.35, 0.2), vec3(1.0, 0.7, 0.2), h), pc, clamp(photoP, 0.0, 1.0) * 0.8);
        C += pc * m;
        H += rise * m;
    }
    vec3 wc = C / max(F, 1e-4);
    float near = H / max(F, 1e-4);
    float fwF = fwidth(F) + 1e-3;
    float inside = smoothstep(0.5 - fwF, 0.5 + fwF, F);
    // Translucent wax: bright core, dark soft rim, glow into the liquid.
    float core = smoothstep(0.5, 1.6, F);
    vec3 wax = wc * (0.3 + 1.1 * core) * (0.6 + 0.6 * near);
    // A dark translucent rim just inside the edge.
    wax *= 0.55 + 0.45 * smoothstep(0.5, 0.75, F);
    col = mix(col, wax, inside);
    col += wc * smoothstep(0.1, 0.4, F) * (1.0 - inside) * (0.1 + 0.4 * clamp(glowP, 0.0, 1.0)) * (0.7 + 0.6 * bass);
    col += vec3(1.0, 0.95, 0.9) * pow(core, 3.0) * near * 0.15;
    finish(col);
}
