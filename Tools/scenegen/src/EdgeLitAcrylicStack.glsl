//@doc
 * @brief EDGE-LIT ACRYLIC STACK: a stack of clear acrylic plates, one behind the other, each lit from its edge and
 * carrying an engraved pattern -- rings, a hexagon net, a spiral, waves, a dot field -- that glows where the light
 * caught in the plate meets the engraving: the patterns hang at different depths, crossing in parallax as the stack
 * turns slowly; each plate's light comes from one band of the music, reaching further in from its lit edge the louder
 * its band.  The plates are tilted planes the view meets one by one; their glow adds up like light, their edges shine.
 * The plates are shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpectrum[32] -> each plate listens to its own band: its light reaches further in from the edge
 *   audioAdvance      -> the stack turns slowly (integrated)
 *   audioSwell        -> how far the light reaches in on every plate
 *
 * Knobs: plateP (how many plates), lineP (how fine the engravings are), hueP.
//@params plateP lineP
//@audio audioSpectrum[32] audioSwell
//@body
/**  How close a value lies to the nearest whole number, as a thin line.
 *
 * @param x  The value. (in)
 * @param w  The line's half width (in the value's units). (in)
 *
 * @return
 *   The line, 0..1.
 **/
float lineAt(float x, float w)
{
    float d = abs(x - floor(x + 0.5));
    return exp(-pow(d / w, 2.0));
}

/**  A plate's engraving.
 *
 * @param uv    The place on the plate (-1..1). (in)
 * @param kind  0 rings, 1 hexagon net, 2 spiral, 3 waves, 4 dot field. (in)
 * @param L     How fine the engraving is. (in)
 *
 * @return
 *   The engraving's glow, 0..1.
 **/
float engrave(vec2 uv, float kind, float L)
{
    if (kind < 0.5) return lineAt(length(uv) * L, 0.06);
    if (kind < 1.5) {
        vec2 q = uv * L * 0.8;
        const vec2 R = vec2(1.0, 1.7320508);
        vec2 a = mod(q, R) - 0.5 * R, b = mod(q - 0.5 * R, R) - 0.5 * R;
        vec2 h = abs(dot(a, a) < dot(b, b) ? a : b);
        float hex = max(dot(h, vec2(0.8660254, 0.5)), h.y);
        return exp(-pow((0.5 - hex) / 0.04, 2.0));
    }
    if (kind < 2.5) return lineAt(atan(uv.y, uv.x) / 6.2831853 * 3.0 + length(uv) * L * 0.6, 0.06);
    if (kind < 3.5) return lineAt(uv.y * L * 0.8 + 0.3 * sin(4.0 * uv.x), 0.06);
    vec2 f = fract(uv * L * 0.8) - 0.5;
    return smoothstep(0.14, 0.08, length(f));
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float N = floor(4.0 + 2.0 * clamp(plateP, 0.0, 1.0));
    float L = 6.0 + 6.0 * clamp(lineP, 0.0, 1.0);
    float turn = 0.02 * sceneTime + 0.08 * audioAdvance;
    float sw = clamp(audioSwell, 0.0, 1.0);
    vec3 rd = normalize(vec3(p, 1.4));
    vec3 col = famCol(fh, 0.45) * 0.012;
    for (int k = 0; k < 6; ++k) {
        float fk = float(k);
        if (fk >= N) break;
        float z0 = 1.0 + 0.32 * fk;
        float yaw = 0.35 * sin(turn + 1.3 * fk), pitch = 0.2 * sin(0.7 * turn + 2.1 * fk);
        vec3 n = vec3(sin(yaw) * cos(pitch), sin(pitch), cos(yaw) * cos(pitch));
        vec3 o = vec3(0.0, 0.0, z0);
        float t = dot(o, n) / dot(rd, n);
        vec3 x = rd * t - o;
        vec3 ax = normalize(cross(vec3(0.0, 1.0, 0.0), n)), ay = cross(n, ax);
        vec2 uv = vec2(dot(x, ax), dot(x, ay));
        vec2 hs = vec2(1.0, 0.62);
        float edge = min(hs.x - abs(uv.x), hs.y - abs(uv.y));
        if (edge < -0.01) continue;
        // the plate's band: the light reaches in from the left edge
        int b = 3 + 5 * k;
        float band = clamp((audioSpectrum[b] + audioSpectrum[b + 1] + audioSpectrum[b + 2]) / 3.0, 0.0, 1.0);
        float reach = mix(sw, band, 0.6) * 1.3 + 0.1;
        float from = (uv.x + hs.x) / (2.0 * hs.x);
        float lit = smoothstep(reach + 0.2, reach - 0.2, from);
        float g = engrave(uv / hs.x, mod(fk, 5.0), L);
        vec3 c = famLight(fh, fk / max(N - 1.0, 1.0), 0.45);
        float inside = smoothstep(-0.01, 0.01, edge);
        col += c * g * inside * (0.06 + 1.2 * lit) / (0.6 + 0.4 * z0);
        col += c * exp(-pow(edge / 0.006, 2.0)) * (0.15 + 0.7 * band) / (0.6 + 0.4 * z0);
    }
    finish(col);
}
