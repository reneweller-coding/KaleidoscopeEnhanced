//@doc
 * @brief FIBONACCI RECTANGLE MOSAIC: squares of the golden rectangle's spiral subdivision -- a square cut from a rectangle of ratio 1.618, then
 * from what is left, again and again -- filling the picture in a spiral, each square showing the photo at its own scale; the picture is
 * mirrored over the whole screen, the spiral turns slowly and the division follows the swell.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the spiral turns (integrated)
 *   audioSwell      -> the squares' windows zoom and the division deepens
 *
 * Knobs: depthP (how many squares), zoomP (how large the windows are), hueP.
//@params depthP zoomP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float t = sceneTime * 0.03 + 0.25 * audioAdvance;
    vec2 q = rot2(t) * p * 1.35;
    q = abs(fract(q * 0.5 + 0.5) * 2.0 - 1.0) * vec2(1.618034, 1.0);
    vec4 r = vec4(0.0, 0.0, 1.618034, 1.0);
    float depth = 5.0 + 5.0 * clamp(depthP, 0.0, 1.0);
    vec3 col = imgLod(q * 0.5 + 0.2, 3.0);
    for (int i = 0; i < 11; ++i) {
        if (float(i) >= depth) break;
        float s = min(r.z, r.w);
        int k = i - 4 * (i / 4);
        vec2 corner;
        vec4 rest;
        if (k == 0) { corner = r.xy; rest = vec4(r.x + s, r.y, r.z - s, r.w); }
        else if (k == 1) { corner = vec2(r.x, r.y + r.w - s); rest = vec4(r.x, r.y, r.z, r.w - s); }
        else if (k == 2) { corner = vec2(r.x + r.z - s, r.y); rest = vec4(r.x, r.y, r.z - s, r.w); }
        else { corner = r.xy; rest = vec4(r.x, r.y + s, r.z, r.w - s); }
        vec2 l = (q - corner) / s;
        if (l.x >= 0.0 && l.x < 1.0 && l.y >= 0.0 && l.y < 1.0) {
            float fi = float(i);
            float z = 0.5 + 0.9 * clamp(zoomP, 0.0, 1.0) + 0.3 * clamp(audioSwell, 0.0, 1.0) * sin(0.4 * t * 20.0 + fi);
            vec2 uv = (l - 0.5) * z * 0.9 + 0.5 + 0.12 * (hash22(vec2(fi, 3.0)) - 0.5);
            col = imgLod(uv, 0.5) * (0.85 + 0.2 * hash21(vec2(fi, 8.0)));
            col *= 0.82 + 0.25 * smoothstep(0.0, 0.04, min(min(l.x, l.y), min(1.0 - l.x, 1.0 - l.y)));
            break;
        }
        r = rest;
    }
    finish(col * 1.05);
}
