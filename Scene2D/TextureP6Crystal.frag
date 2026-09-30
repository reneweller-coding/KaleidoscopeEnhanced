#version 330 core
out vec4 fragColor;
/**
 * @file TextureP6Crystal.frag
 * @brief TEXTURE P6 CRYSTAL: the photograph cut into a crystal of
 * six-fold pinwheels -- each hexagonal cell holds the picture six times,
 * rotated (not mirrored) around its centre, so the cells swirl like
 * turbines; every one of the six wedges is a bevelled facet catching a
 * slowly circling light, with sharp bright facet edges and a small
 * refracting jewel at each cell centre.  The photo glides under the
 * crystal, the facet light wanders.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the photo glides under the crystal (integrated)
 *   audioPhase      -> the crystal lattice turns (integrated)
 *   audioSpread     -> bevel depth
 *   audioKick       -> the facet edges flash (light)
 *   audioMode       -> light temperature: cool in minor, warm in major
 *   audioHigh       -> the jewels sparkle (light)
 *
 * Knobs: cellP (cell size), twistP (pinwheel twist inside the cells), photoZoomP, hueP.
 */

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneTime;
uniform float sceneAdvance;
uniform float audioAdvance;
uniform float audioLevel;
uniform float audioValence;
uniform float audioChromaHue;
uniform float audioPhase;
uniform float audioSpread;
uniform float audioKick;
uniform float audioMode;
uniform float audioHigh;

uniform float cellP;
uniform float twistP;
uniform float photoZoomP;
uniform float hueP;

// ---- shared building blocks (texture pool, noise, shapes) ----
float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float hash21(vec2 p)
{
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p)
{
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
}
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p)
{
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; ++i) { v += a * noise2(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 2.3; a *= 0.5; }
    return v;
}
float fbm3(vec2 p)
{
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 3; ++i) { v += a * noise2(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 2.3; a *= 0.5; }
    return v;
}

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}
// Mirror-repeat in the shader (the engine's textures mirror, the editor's
// repeat -- doing it here makes both identical).  Identity inside [0,1].
vec2 mirrorUV(vec2 uv) { return 1.0 - abs(fract(uv * 0.5) * 2.0 - 1.0); }
// The photo at a mip level: lod 0 is full detail, ~4 a soft field, ~7 broad masses.
vec3 imgLod(vec2 uv, float lod) {
    uv = mirrorUV(uv);
    return (interpolation * textureLod(tex0, uv, lod) + (1.0 - interpolation) * textureLod(tex1, uv, lod)).rgb;
}
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 hsv2rgb(vec3 c) {
    vec3 k = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    return c.z * mix(vec3(1.0), k, c.y);
}
float hue_of(vec3 c) {
    float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b)), d = mx - mn + 1e-5;
    float h = (mx == c.r) ? (c.g - c.b) / d : (mx == c.g) ? 2.0 + (c.b - c.r) / d : 4.0 + (c.r - c.g) / d;
    return fract(h / 6.0);
}
float satOf(vec3 c) { float mx = max(c.r, max(c.g, c.b)); return (mx - min(c.r, min(c.g, c.b))) / max(mx, 1e-3); }
// A glowing colour for a place: the photo's own hue where it has one, a
// slowly wandering hue field (anchored on hue0) where the photo is grey.
vec3 glowColour(vec3 photo, vec2 q, float hue0) {
    vec3 field = hsv2rgb(vec3(fract(hue0 + 0.55 * fbm3(q * 0.8) + 0.03 * audioAdvance), 0.85, 1.0));
    vec3 own = photo / max(max(photo.r, max(photo.g, photo.b)), 1e-3); own = own * own * own;
    return mix(field, own, smoothstep(0.12, 0.35, satOf(photo)));
}
// Push a colour toward full saturation, keeping its hue (neon from a photo).
vec3 neonOf(vec3 c, float k) {
    vec3 n = c / max(max(c.r, max(c.g, c.b)), 1e-3);
    return pow(n, vec3(k));
}
// The photo along an endless scroll in y without mirror seams: the photo
// repeats mirrored, so a scroll crosses a visible fold every unit; two reads
// half a period apart are cross-faded so each fold is hidden by the other.
vec3 imgScroll(vec2 uv, float lod) {
    float w = abs(fract(uv.y) - 0.5) * 2.0;           // 1 at the fold, 0 between
    w = smoothstep(0.55, 1.0, w);
    return mix(imgLod(uv, lod), imgLod(uv + vec2(0.37, 0.5), lod), w);
}
// Height from the photo: broad masses plus a share of the detail.
float texHeight(vec2 uv, float lodBroad, float detail) {
    return mix(luma(imgLod(uv, lodBroad)), luma(imgLod(uv, max(lodBroad - 3.0, 0.0))), detail);
}
// Gradient of the photo's luma at a mip level (per UV unit).
vec2 texGrad(vec2 uv, float lod) {
    float e = exp2(lod) / 1024.0;
    return vec2(luma(imgLod(uv + vec2(e, 0.0), lod)) - luma(imgLod(uv - vec2(e, 0.0), lod)),
                luma(imgLod(uv + vec2(0.0, e), lod)) - luma(imgLod(uv - vec2(0.0, e), lod))) / (2.0 * e);
}
// Edge strength of the photo (0..1-ish) at a mip level.
float texEdge(vec2 uv, float lod) { return length(texGrad(uv, lod)) * exp2(lod) / 1024.0 * 6.0; }

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

mat2 rot2(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
float smin(float a, float b, float k)
{
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
}
float sdSeg(vec2 p, vec2 a, vec2 b)
{
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h);
}
// Centred coordinates: y in -0.5..0.5, x scaled by the aspect.
vec2 screenP() { return (gl_FragCoord.xy / resolution - 0.5) * vec2(resolution.x / resolution.y, 1.0); }
// House finish: loudness brightness and the soft highlight roll-off.
void finish(vec3 col)
{
    col *= 0.9 + 0.2 * audioLevel;
    vec3 t = max(col, 0.0);
    t /= 1.0 + 0.35 * max(t.r, max(t.g, t.b));
    fragColor = vec4(clamp(t, 0.0, 1.0), 1.0);
}

void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float cell = 0.22 + 0.25 * clamp(cellP, 0.0, 1.0);
    vec2 q = rot2(0.008 * sceneTime + 0.1 * audioPhase) * p / cell;
    const vec2 s = vec2(1.0, 1.7320508);
    vec2 ha = mod(q, s) - s * 0.5;
    vec2 hb = mod(q - s * 0.5, s) - s * 0.5;
    vec2 h = dot(ha, ha) < dot(hb, hb) ? ha : hb;
    vec2 cid = q - h;
    float r = length(h);
    float ang = atan(h.y, h.x);
    // Six wedges; each is the same piece of photo, rotated (p6: no mirrors).
    float sec = 1.0471976;
    float wi = floor((ang + 3.14159265) / sec);                // wedge index (space)
    float la = ang - (wi * sec - 3.14159265) ;                  // 0..sec inside the wedge
    float tw = (0.3 + 1.2 * clamp(twistP, 0.0, 1.0)) * r;       // pinwheel twist grows outward
    vec2 lp = r * vec2(cos(la + tw), sin(la + tw));
    float z = 0.35 + 0.35 * clamp(photoZoomP, 0.0, 1.0);
    vec2 win = vec2(0.5) + 0.3 * vec2(sin(0.011 * sceneTime + 0.15 * audioAdvance), cos(0.009 * sceneTime + 0.12 * audioAdvance));
    vec2 uv = win + (lp - vec2(0.25, 0.1)) * z + cid * 0.013;
    vec3 ph = imgLod(uv, 0.4);
    // Facets: each wedge a bevel tilted toward the cell centre.
    float bevel = 0.4 + 0.6 * clamp(audioSpread, 0.0, 1.0);
    float mid = wi * sec - 3.14159265 + sec * 0.5;
    vec3 n = normalize(vec3(-cos(mid) * bevel * smoothstep(0.1, 0.5, r), -sin(mid) * bevel * smoothstep(0.1, 0.5, r), 1.0));
    float la2 = 0.15 * sceneTime;
    vec3 L = normalize(vec3(cos(la2), sin(la2), 1.2));
    float diff = max(dot(n, L), 0.0);
    float spec = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 24.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    vec3 lc = mix(vec3(0.75, 0.88, 1.1), vec3(1.15, 0.9, 0.7), mode);
    float m = luma(imgLod(win, 8.0));
    vec3 col = max((ph - m) * 1.4 + m, 0.0) * (0.35 + 0.85 * diff) * lc;
    col += lc * spec * 0.35;
    // Facet edges: wedge borders and the hexagon rim.
    float px = fwidth(r) * 1.5 + 1e-4;
    float edgeW = min(la, sec - la) * r;
    float hexD = max(abs(h.x), abs(h.x) * 0.5 + abs(h.y) * 0.866);   // pointy-top cell, inradius 0.5
    vec3 gc = glowColour(imgLod(win, 5.0), cid * 0.1, hueP * 0.159);
    float edge = exp(-edgeW / px) * smoothstep(0.05, 0.15, r) + exp(-max(0.5 - hexD, 0.0) / px);
    col += mix(gc, vec3(1.0), 0.5) * edge * (0.2 + 0.9 * kick);
    // The jewel at the centre: a small refracting dome.
    float jr = 0.1;
    float jd = smoothstep(jr, jr - px, r);
    vec3 jewel = imgLod(win - h * 2.0, 1.0) * 1.2 * gc;
    jewel += vec3(1.0) * pow(max(0.0, 1.0 - length(h - vec2(-0.03, 0.03)) / 0.04), 3.0) * (0.3 + 1.2 * hi);
    col = mix(col, jewel, jd);
    finish(col);
}
