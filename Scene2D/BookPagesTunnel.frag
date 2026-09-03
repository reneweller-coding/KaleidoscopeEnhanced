#version 330 core
out vec4 fragColor;
/**
 * @file BookPagesTunnel.frag
 * @brief BOOK PAGES TUNNEL: a tunnel whose walls are the pages of a book,
 * turning as we pass.  Each page is a leaf hinged on the tunnel's spine
 * that turns steadily on the scene clock (which runs with the music's
 * energy, never with a beat tracker, so a resync can never jolt the
 * leaves), carrying the photo on one side and its palette negative on the
 * other.  The flight down the spine is steady; the kick lights the edges.
 *
 * Audio Reactivity:
 *   sceneAdvance  -> page angle and flight along the spine (continuous)
 *   audioKick     -> page edges flash (light)
 *   audioSwell    -> reading light (slow)
 *   audioLevel    -> brightness
 *
 * Per-activation variety: pagesP (pages per unit), sizeP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float pagesP;
uniform float sizeP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  col = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float g   = dot(col, vec3(0.333));
    return mix(vec3(g), col, 0.55 + 0.45 * audioValence);
}

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }

// Intersect a ray with a rectangular page: a quad in the plane through the
// spine (the x axis at height 0, running along z) tilted by angle `ang`.
// Returns t, and uv on the page, or t < 0.
vec3 hitPage(vec3 ro, vec3 rd, float zc, float ang, float w, float h)
{
    // Page plane: contains the spine line (y = 0, z = zc) along x, rotated
    // about that line by ang; the page extends from the spine outward (v in
    // 0..h along the rotated direction) and along x in -w..w.
    vec3 dirUp = vec3(0.0, cos(ang), sin(ang));
    vec3 n = vec3(0.0, -sin(ang), cos(ang));
    vec3 o = vec3(0.0, 0.0, zc);
    float denom = dot(rd, n);
    if (abs(denom) < 1e-4) return vec3(-1.0);
    float t = dot(o - ro, n) / denom;
    if (t < 0.0) return vec3(-1.0);
    vec3 hp = ro + rd * t;
    float u = hp.x;
    float v = dot(hp - o, dirUp);
    if (abs(u) > w || v < 0.0 || v > h) return vec3(-1.0);
    return vec3(t, u / w * 0.5 + 0.5, v / h);
}

// Shade one page hit: the photo on the front, its palette negative on the
// back, a reading light from above, a kick-lit edge, faint text lines.
vec3 shadePage(vec3 best, float bestAng, vec3 rd, float hue)
{
    vec3 n = vec3(0.0, -sin(bestAng), cos(bestAng));
    float face = step(0.0, -dot(rd, n));
    vec2 uv = best.yz;
    vec3 photo = img(vec2(uv.x, 1.0 - uv.y));
    vec3 pal = imgPalette(hue * 0.159 + 0.5);
    vec3 back = mix((1.0 - photo) * pal * 1.3, pal, 0.4) * 1.5 + 0.12;
    vec3 col = mix(back, photo * 1.4 + imgPalette(hue * 0.159 + 0.3) * 0.15 + 0.08, face);
    float lit = 0.65 + 0.35 * abs(n.y);
    col *= lit * (0.7 + 0.5 * audioLevel) * (0.85 + 0.35 * clamp(audioSwell, 0.0, 1.0));
    vec2 e = min(uv, 1.0 - uv);
    float edge = exp(-min(e.x, e.y) * 40.0);
    col += imgPalette(hue * 0.159 + 0.9) * edge * (0.3 + 1.0 * audioKick);
    col *= 0.9 + 0.1 * pow(0.5 + 0.5 * sin(uv.y * 120.0), 8.0);
    float fog = 1.0 - exp(-best.x * 0.12);
    return mix(col, imgPalette(hue * 0.159 + 0.6) * 0.25, clamp(fog, 0.0, 0.85));
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float spacing = 1.0 / (2.0 + 2.0 * clamp(pagesP, 0.0, 1.0));
    float pw = 1.1 * (sizeP > 0.05 ? sizeP : 1.0), ph = 0.9 * (sizeP > 0.05 ? sizeP : 1.0);
    float travel = sceneAdvance * 1.2 + sceneTime * 0.25;

    // Camera slightly above the spine, looking down the book.
    vec3 ro = vec3(0.0, 0.35, 0.0);
    vec3 rd = normalize(vec3(p.x, p.y - 0.1, 1.3));

    // Pages ahead of the camera, each at its own angle: the scene clock
    // turns all of them steadily, each offset by its index so the tunnel is
    // a spiral of leaves.  Two hits are kept: the nearest page of all, and
    // the nearest page that is still well ahead (zc >= 0.7).  A page that
    // has come close fades out over the one behind it, so it never fills
    // the frame with one dim close-up and never pops away.
    float nearT = 1e9; vec3 nearH = vec3(-1.0); float nearAng = 0.0; float nearZ = 0.0;
    float farT = 1e9;  vec3 farH = vec3(-1.0);  float farAng = 0.0;  float farZ = 0.0;
    float k0 = floor(travel / spacing);
    for (int k = 0; k < 28; ++k)
    {
        float idx = k0 + float(k);
        float zc = idx * spacing - travel;
        if (zc < 0.02) continue;
        float ang = sceneAdvance * 1.1 + sceneTime * 0.2 + idx * 0.45 + hash11(idx * 3.1) * 0.3;
        vec3 h = hitPage(ro, rd, zc, ang, pw, ph);
        if (h.x <= 0.0) continue;
        if (h.x < nearT) { nearT = h.x; nearH = h; nearAng = ang; nearZ = zc; }
        if (zc >= 0.7 && h.x < farT) { farT = h.x; farH = h; farAng = ang; farZ = zc; }
    }

    // Between the pages: the book's far end -- the photo as an open spread,
    // dim, so no frame is ever black.
    vec2 fuv = fract(vec2(p.x * 0.4 + 0.5 + sceneAdvance * 0.005, p.y * 0.6 + 0.5));
    vec3 bg = img(fuv) * (imgPalette(hue * 0.159 + 0.6) * 0.8 + 0.25) + imgPalette(hue * 0.159 + 0.1) * exp(-length(p - vec2(0.0, 0.1)) * 3.0) * 0.5;

    vec3 col = bg;
    if (farH.x > 0.0) col = shadePage(farH, farAng, rd, hue);
    if (nearH.x > 0.0 && nearZ < 0.7)
    {
        vec3 nc = shadePage(nearH, nearAng, rd, hue);
        col = mix(col, nc, smoothstep(0.15, 0.6, nearZ));
    }

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
