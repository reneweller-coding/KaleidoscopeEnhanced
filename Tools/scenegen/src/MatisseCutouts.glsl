//@doc
 * @brief MATISSE CUTOUTS: paper cut-outs in the late Matisse manner --
 * bold, freely cut shapes (seaweed fronds, leaves, stars, blobs) in flat
 * gouache colours float over large coloured panels, each shape turning
 * and drifting slowly like something swimming, casting a faint shadow on
 * the paper beneath; the panel colours and some shapes take their tones
 * from the photograph, the gouache has a dry-brushed grain.  Endless,
 * mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the shapes drift and turn (integrated, jump-free)
 *   audioSpread     -> the shapes grow
 *   audioMode       -> the gouache warms (major) or cools (minor)
 *   audioKick       -> the colours brighten (light)
 *   audioRoughness  -> the cut edges get more ragged
 *   audioSwell      -> the shadows deepen (slow)
 *
 * Knobs: shapeP (shape density), lobeP (lobes per shape), photoP (photo colours), hueP.
//@params shapeP lobeP photoP
//@audio audioSpread audioMode audioKick audioRoughness audioSwell
//@body
// Matisse's gouache colours; the mode only warms or cools them.
vec3 matPal(float k, float mode)
{
    vec3 c[6];
    c[0] = vec3(0.1, 0.25, 0.65); c[1] = vec3(0.95, 0.45, 0.15); c[2] = vec3(0.95, 0.35, 0.5);
    c[3] = vec3(0.98, 0.8, 0.2);  c[4] = vec3(0.15, 0.55, 0.4);  c[5] = vec3(0.95, 0.92, 0.85);
    int i = int(mod(k, 6.0));
    vec3 r = c[0];
    for (int n = 1; n < 6; ++n) if (n == i) r = c[n];
    return r * mix(vec3(0.9, 0.95, 1.1), vec3(1.1, 1.0, 0.9), mode);
}

// Signed distance-ish of a lobed shape in its own frame.
float cutout(vec2 l, float R, float lobes, float seed, float rough)
{
    float a = atan(l.y, l.x);
    vec2 u = vec2(cos(a), sin(a));
    float rr = R * (0.65 + 0.35 * cos(lobes * a + seed * 6.28));
    rr *= 0.9 + 0.1 * noise2(u * 3.0 + seed * 11.0) + 0.06 * rough * noise2(u * 14.0 + seed * 5.0);
    return length(l) - rr;
}

void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    float T = 0.04 * sceneTime + 0.3 * audioAdvance;
    // Panels: large soft-edged colour fields.
    vec2 pg = p * 1.2 + vec2(0.01 * sceneTime, 0.0);
    vec2 pid = floor(pg);
    vec3 panel = matPal(floor(hash21(pid) * 6.0), mode) * 0.9;
    panel = mix(panel, glowColour(imgLod(pid * 0.1 + 0.5, 4.0), pid, hueP * 0.159) * 0.8, 0.2 * clamp(photoP, 0.0, 1.0));
    vec3 col = panel;
    // Shapes on a jittered grid (3x3 search, they may reach into neighbours).
    float S = 1.6 + 1.4 * clamp(shapeP, 0.0, 1.0);
    vec2 g = p * S;
    vec2 gi = floor(g);
    float grow = 0.8 + 0.4 * clamp(audioSpread, 0.0, 1.0);
    float pxg = fwidth(g.x) * 1.2;                             // derivatives before any branch
    for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
        vec2 id = gi + vec2(i, j);
        float h = hash21(id);
        if (h > 0.8) continue;
        vec2 c = id + 0.5 + 0.3 * vec2(sin(T * (0.6 + h) + h * 6.28), cos(T * (0.5 + h) + h * 9.0));
        float rot = T * (h - 0.5) * 2.0 + h * 6.28;
        vec2 l = rot2(rot) * (g - c);
        float lobes = floor(3.0 + 5.0 * clamp(lobeP, 0.0, 1.0) * hash21(id + 3.0));
        float R = (0.3 + 0.2 * hash21(id + 4.0)) * grow;
        float d = cutout(l, R, lobes, h, rough);
        // Shadow, offset down-right.
        float ds = cutout(rot2(rot) * (g - c - vec2(0.04, -0.05)), R, lobes, h, rough);
        col *= 1.0 - (0.15 + 0.25 * swell) * smoothstep(0.05, -0.02, ds);
        float px = pxg;
        float inside = smoothstep(px, -px, d);
        float kp = floor(hash21(floor((c / S) * 1.2 + vec2(0.01 * sceneTime, 0.0))) * 6.0);   // the panel under the shape's centre
        float ks = floor(hash21(id + 7.0) * 5.0);
        vec3 sc = matPal(ks >= kp ? ks + 1.0 : ks, mode);           // never the panel's own colour
        sc = mix(sc, glowColour(imgLod(hash22(id + 2.0), 4.0), id, hueP * 0.159), 0.3 * clamp(photoP, 0.0, 1.0));
        col = mix(col, sc, inside);
    }
    // Gouache grain.
    col *= 0.93 + 0.07 * noise2(p * vec2(220.0, 90.0));
    finish(col * (1.0 + 0.25 * kick));
}
