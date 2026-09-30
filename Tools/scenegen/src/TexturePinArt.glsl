//@doc
 * @brief TEXTURE PIN ART: the pin-art toy -- a dense bed of polished metal
 * pins seen from above, pushed up into a relief of the photograph (bright
 * parts stand high, dark parts sink), each pin head a small shiny dome
 * reflecting the light, the high pins casting long shadows over the low
 * ones; slow waves roll through the bed as if a hand pressed from below,
 * and the relief slowly morphs as the photo drifts.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the waves roll and the photo drifts (integrated)
 *   audioSpread     -> relief depth
 *   audioBass       -> a push wave from the centre (slow-smoothed light-level motion)
 *   audioKick       -> the pin heads flash (light)
 *   audioMode       -> metal: chrome in minor, brass in major
 *   audioSwell      -> the light swings lower (longer shadows, slow)
 *
 * Knobs: pinP (pin density), waveP (wave height), tintP (photo tint on the heads), hueP.
//@params pinP waveP tintP
//@audio audioSpread audioBass audioKick audioMode audioSwell
//@body
float gT;
float heightAt(vec2 w)
{
    vec2 uv = w * 0.6 + 0.5 + vec2(0.004, 0.002) * sceneTime;
    float h = luma(imgK(uv, 3.0));
    h += clamp(waveP, 0.0, 1.0) * 0.25 * sin(dot(w, vec2(3.0, 1.7)) - gT) * sin(dot(w, vec2(-1.3, 2.4)) + gT * 0.7);
    return h;
}

void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    gT = 0.3 * sceneTime + 2.0 * audioAdvance;
    float S = 22.0 + 22.0 * clamp(pinP, 0.0, 1.0);
    float depth = (0.6 + 0.8 * clamp(audioSpread, 0.0, 1.0));
    // Light direction (low when swelling -> long shadows).
    vec2 ld = normalize(vec2(-0.7, 0.6));
    float shadowLen = (0.6 + 1.2 * swell) * depth;               // in pin spacings per unit height
    vec2 g = p * S;
    // Hex packing.
    const vec2 s = vec2(1.0, 1.7320508);
    vec2 a = mod(g, s) - s * 0.5;
    vec2 b = mod(g - s * 0.5, s) - s * 0.5;
    vec2 l = dot(a, a) < dot(b, b) ? a : b;
    vec2 cid = g - l;
    float h = heightAt(cid / S);
    float mode = clamp(audioMode, 0.0, 1.0);
    vec3 metal = mix(vec3(0.75, 0.78, 0.82), vec3(0.85, 0.65, 0.35), mode);
    vec2 uvc = cid / S * 0.6 + 0.5 + vec2(0.004, 0.002) * sceneTime;
    vec3 tint = mix(vec3(1.0), imgK(uvc, 2.0) * 1.4 + 0.2, clamp(tintP, 0.0, 1.0));
    // Pin head dome shading.
    float rr = length(l) / 0.42;
    float px = S / resolution.y * 2.0;
    float head = smoothstep(1.0 + px, 1.0 - px, rr);
    vec3 n = normalize(vec3(l / 0.42 * 0.9, sqrt(max(0.0, 1.0 - rr * rr))));
    vec3 L = normalize(vec3(ld, 0.6 - 0.3 * swell));
    float diff = max(dot(n, L), 0.0);
    float spec = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 40.0);
    vec3 headC = metal * tint * (0.2 + 0.95 * diff) * (0.3 + 1.1 * h) + vec3(1.0) * spec * (0.5 + 1.2 * kick);
    // The bed between the pins: in shadow; plus shadows cast by higher
    // neighbours toward -ld.
    float shade = 1.0;
    for (int k = 1; k <= 3; ++k) {
        vec2 sp = cid / S + ld * float(k) / S;                   // neighbour toward the light
        float hn = heightAt(sp);
        float drop = (hn - h) * depth * shadowLen * S * 0.1 - float(k) * 0.35;
        shade *= 1.0 - 0.45 * smoothstep(0.0, 0.3, drop);
    }
    vec3 bed = vec3(0.03, 0.03, 0.035) + metal * 0.08 * h;
    vec3 col = mix(bed, headC * shade, head);
    // Faint glow at the tallest pins.
    vec3 gc = glowColour(imgK(uvc, 5.0), cid * 0.02, hueP * 0.159);
    col += gc * head * smoothstep(0.75, 1.0, h) * 0.15;
    finish(col);
}
