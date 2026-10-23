//@doc
 * @brief PIVOT CHORD MODULATION BRIDGE: a modulation through a pivot chord: two colour regions (two keys) are joined by a bridge that makes sense in both; the picture shows two halves of the photo whose border glides over a shared strip when the key changes.  The left half is tinted warm, the right
 * half cool, and inside the bridge both tints stand in thin interleaved stripes that fuse to the photo's own colours at its middle.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the bridge wanders with the harmony (integrated)
 *   audioSwell       -> the width of the bridge
 *
 * Knobs: sizeP (the strength of the tints), hueP.
//@params sizeP
//@audio audioSwell audioHarmAdvance
//@body
vec3 hueRot(vec3 c, float a)
{
    float s = sin(a);
    float co = cos(a);
    vec3 k = vec3(0.57735);
    return c * co + cross(k, c) * s + k * dot(k, c) * (1.0 - co);
}
void main()
{
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    vec2 uv = p * 0.85 + 0.5 + 0.02 * vec2(sin(0.04 * sceneTime), cos(0.035 * sceneTime));
    vec3 c = imgLod(uv, 0.5);
    float tint = 0.5 + 0.8 * clamp(sizeP, 0.0, 1.0);
    vec3 warm = hueRot(c, -0.55 * tint) * vec3(1.1, 1.0, 0.85);
    vec3 cool = hueRot(c, 0.7 * tint) * vec3(0.85, 1.0, 1.15);
    float b = 0.4 * asp * 0.5 * sin(0.12 * audioHarmAdvance + 0.04 * sceneTime) + 0.06 * sin(3.0 * p.y + 0.3 * audioHarmAdvance);
    float w = 0.08 + 0.2 * clamp(audioSwell, 0.0, 1.0);
    float m = smoothstep(b - w, b + w, p.x);
    float stripe = 0.5 + 0.5 * sin((p.x - b) * 120.0 + 12.0 * p.y);
    float inb = 1.0 - smoothstep(0.0, w, abs(p.x - b));
    float mm = mix(m, smoothstep(0.35, 0.65, stripe), 0.7 * inb);
    vec3 col = mix(warm, cool, mm);
    col = mix(col, c, 0.55 * inb * inb);
    finish(col * 1.1);
}
