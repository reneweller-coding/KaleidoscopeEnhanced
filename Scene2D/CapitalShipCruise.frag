#version 330 core
out vec4 fragColor;
/**
 * @file CapitalShipCruise.frag
 * @brief CAPITAL SHIP CRUISE: a kilometre-long capital ship under way through
 * deep space, seen from a camera flying alongside it. The silhouette is
 * raymarched from a handful of large primitives -- tapered hull, dorsal
 * spine, bridge tower, ventral keel and four engine bells -- while the
 * surface detail (panel seams, hull plating, window rows, running lights)
 * comes from the shading, which is how a ship this size reads on screen
 * without a million-triangle model. The nebula behind it inherits the
 * slideshow photo's palette; the starfield streams past to sell the motion.
 *   audioAdvance -> distance travelled (starfield stream + nebula drift)
 *   audioSwell   -> engine bell intensity and the exhaust plume's reach
 *   audioKick    -> thruster flare + a pulse down the running-light rows
 *   audioBass    -> slow roll of the hull key light
 *   audioBeatPhase-> the navigation strobe on the spine, once per beat
 *   audioChromaHue-> nebula hue follows the musical key
 *
 * Per-activation variety:
 *   hullP   float ship length / how much frame the hull takes   (0.7..1.6)
 *   glowP   float engine and running-light intensity            (0.6..1.8)
 *   nebulaP float nebula density behind the ship                (0.3..1.6)
 *   hueP    float palette offset of the nebula                  (0..6.28)
 */

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioPhase;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioKick;
uniform float audioCentroid;
uniform float audioValence;
uniform float audioSubBass;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioBeatPhase;
uniform float audioChromaHue;

uniform float hullP;
uniform float glowP;
uniform float nebulaP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

// IMG-PALETTE (house standard): colours come from a rotating arc in the
// CURRENT slideshow image, so every activation inherits a fresh palette from
// the photos; the arc follows the musical key (audioChromaHue is circular-
// slewed = jump-free) with a slow advance drift, valence shapes saturation.
vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float hash21(vec2 p)  { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float hash31(vec3 p)  { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }

float noise3(vec3 p)
{
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n = i.x + i.y * 57.0 + i.z * 113.0;
    float a = mix(hash11(n +   0.0), hash11(n +   1.0), f.x);
    float b = mix(hash11(n +  57.0), hash11(n +  58.0), f.x);
    float c = mix(hash11(n + 113.0), hash11(n + 114.0), f.x);
    float d = mix(hash11(n + 170.0), hash11(n + 171.0), f.x);
    return mix(mix(a, b, f.y), mix(c, d, f.y), f.z);
}

float fbm3(vec3 p)
{
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 5; ++i) { s += a * noise3(p); p *= 2.03; a *= 0.5; }
    return s;
}

float sdBox(vec3 p, vec3 b)
{
    vec3 q = abs(p) - b;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float sdCyl(vec3 p, float h, float r)
{
    vec2 d = vec2(length(p.xy) - r, abs(p.z) - h);
    return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

// The ship, in its own space: +z is the bow, -z the engines.
// Only the SILHOUETTE is modelled -- plating and greebles are shaded, not
// carved, which is what keeps a hull this size cheap to march.
float shipSDF(vec3 p, float len, out float part)
{
    // Bow taper: the hull narrows over the forward third.
    float tp = 1.0 - 0.62 * smoothstep(0.15 * len, 0.98 * len, p.z);
    tp = max(tp, 0.12);

    float hull = sdBox(p, vec3(2.55 * tp, 0.95 * tp, len)) - 0.30 * tp;

    // Dorsal spine, running most of the length.
    float spine = sdBox(p - vec3(0.0, 1.05, -0.15 * len),
                        vec3(0.95, 0.55, 0.72 * len)) - 0.18;

    // Bridge tower and its shoulders, set back from the bow.
    float tower = sdBox(p - vec3(0.0, 2.15, -0.34 * len), vec3(1.25, 1.05, 2.30)) - 0.22;
    tower = min(tower, sdBox(p - vec3(0.0, 3.05, -0.36 * len), vec3(0.72, 0.55, 1.35)) - 0.15);

    // Ventral keel and two sponsons: they break the underside silhouette.
    float keel = sdBox(p - vec3(0.0, -1.15, -0.05 * len),
                       vec3(0.75, 0.62, 0.80 * len)) - 0.16;
    vec3 sp = p;
    sp.x = abs(sp.x);
    float spons = sdBox(sp - vec3(2.55, -0.35, -0.20 * len), vec3(0.62, 0.42, 0.42 * len)) - 0.14;

    // Engine block and four bells at the stern.
    float block = sdBox(p - vec3(0.0, 0.15, -1.02 * len), vec3(2.85, 1.45, 0.11 * len)) - 0.22;
    vec3 bp = p - vec3(0.0, 0.15, -1.13 * len);
    bp.xy = abs(bp.xy) - vec2(1.45, 0.72);
    float bells = sdCyl(bp, 0.10 * len * 0.32, 0.62);

    part = 0.0;
    float d = hull;
    if (spine  < d) { d = spine;  part = 1.0; }
    if (tower  < d) { d = tower;  part = 2.0; }
    if (keel   < d) { d = keel;   part = 1.0; }
    if (spons  < d) { d = spons;  part = 1.0; }
    if (block  < d) { d = block;  part = 3.0; }
    if (bells  < d) { d = bells;  part = 4.0; }
    return d;
}

vec3 shipNormal(vec3 p, float len)
{
    vec2 e = vec2(0.012, 0.0);
    float u;
    return normalize(vec3(
        shipSDF(p + e.xyy, len, u) - shipSDF(p - e.xyy, len, u),
        shipSDF(p + e.yxy, len, u) - shipSDF(p - e.yxy, len, u),
        shipSDF(p + e.yyx, len, u) - shipSDF(p - e.yyx, len, u)));
}

// Deep-space backdrop: three star magnitudes plus a photo-tinted nebula.
vec3 background(vec3 rd, float drift, float neb, vec3 nebTint)
{
    vec3 col = vec3(0.006, 0.008, 0.016);

    // Nebula: two domain-warped octaves, so it has cloud structure rather
    // than an even fog.
    vec3 np = rd * 2.4 + vec3(drift * 0.05, 0.0, drift * 0.02);
    float warp = fbm3(np * 0.7);
    float n = fbm3(np + warp * 1.6);
    n = pow(clamp(n - 0.12, 0.0, 1.0) * 2.3, 1.5) * neb;
    col += nebTint * n * 1.35;
    col += nebTint.bgr * pow(n, 2.2) * 0.55;

    // Stars, on a grid of the view direction so they hold still relative to
    // the sky while the ship and the camera move.
    for (int i = 0; i < 3; ++i) {
        float sc = 90.0 + 150.0 * float(i);
        vec3 sp = rd * sc + vec3(drift * 0.10, 0.0, 0.0);
        vec3 cell = floor(sp);
        vec3 f = fract(sp) - 0.5;
        float h = hash31(cell);
        if (h > 0.978 - 0.004 * float(i)) {
            float d = length(f);
            float b = exp(-d * d * 190.0) * (0.35 + 0.65 * hash31(cell + 7.0));
            // Cool/warm star colours, not flat white.
            vec3 sc2 = mix(vec3(0.72, 0.82, 1.0), vec3(1.0, 0.88, 0.72),
                           hash31(cell + 13.0));
            col += sc2 * b * (1.0 - 0.22 * float(i));
        }
    }
    return col;
}

void main()
{
    float len = (hullP   > 0.01 ? 12.0 + 9.0 * hullP : 18.0);
    float glw = (glowP   > 0.01 ? glowP   : 1.0);
    float neb = (nebulaP > 0.01 ? nebulaP : 0.9);
    float hue = (hueP    > 0.01 ? hueP    : 0.0);

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    // Deliberately slow: this is a capital ship under way, not a fighter.
    // The wall-clock term is a per-activation constant, audioAdvance carries
    // the musical push -- never time*audioX (anti-flicker house rule).
    float t = time * 0.055 + audioAdvance * 0.09;
    float drift = time * 9.0 + audioAdvance * 22.0;

    // Camera flying alongside, a little above the dorsal plane, breathing
    // very slowly in and out.  All coefficients are far under the 4 Hz
    // camera ceiling.
    float sway = sin(t * 0.55);
    // Stand-off distance is set by the SHIP, not by a constant: at 1.2x its
    // own length the whole silhouette reads, which is the entire point of a
    // capital ship.  (The first cut sat 12 units from a 2.5-unit-wide hull
    // and recorded plating and window rows -- a wall, not a vessel.)
    // A slow orbit around the ship rather than a fixed escort position: the
    // silhouette keeps turning, which is the motion an ambient shot needs
    // when subject and camera are otherwise locked together.
    float orb = t * 0.55 + 1.9;
    float standoff = 0.92 * len;
    vec3 ro = vec3(cos(orb) * standoff * 0.86 + 1.4 * sway,
                   0.26 * standoff + 1.5 * sin(t * 0.41 + 1.1),
                   sin(orb) * standoff * 0.86 - 0.08 * len);
    vec3 ta = vec3(0.0, 0.30, 0.0);

    vec3 ww = normalize(ta - ro);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);
    // Slight roll, so the horizon of the shot is never dead level.
    float roll = 0.07 * sin(t * 0.37);
    vec2 ruv = mat2(cos(roll), -sin(roll), sin(roll), cos(roll)) * uv;
    vec3 rd = normalize(ruv.x * uu + ruv.y * vv + 1.45 * ww);

    vec3 nebTint = imgPalette(0.12 + 0.20 * audioCentroid);
    nebTint = mix(vec3(dot(nebTint, vec3(0.333))), nebTint, 1.25);

    // ---- march the hull -------------------------------------------------
    float d = 0.0;
    float part = 0.0;
    float hitPart = -1.0;
    vec3 hp = vec3(0.0);
    int steps = 0;
    for (int i = 0; i < 96; ++i) {
        vec3 p = ro + rd * d;
        float ds = shipSDF(p, len, part);
        steps = i;
        if (ds < 0.004 * (1.0 + d * 0.25)) { hitPart = part; hp = p; break; }
        d += ds * 0.80;          // 0.80: the bow taper is not exactly Lipschitz
        if (d > 90.0) break;
    }

    vec3 col = background(rd, drift, neb, nebTint);

    // ---- shade the hull -------------------------------------------------
    if (hitPart >= 0.0) {
        vec3 n = shipNormal(hp, len);

        // Key light: a distant blue-white sun off the bow quarter; the fill
        // is the nebula itself, which ties the ship to its surroundings.
        // Key from the camera's side of the hull: a rim-lit silhouette on
        // black measured at luma 0.08 and read as a dark slab.
        vec3 key = normalize(vec3(0.66, 0.58, -0.34));
        float dif = max(dot(n, key), 0.0);
        float fill = 0.5 + 0.5 * dot(n, vec3(0.0, 1.0, 0.0));
        float fres = pow(1.0 - max(dot(n, -rd), 0.0), 4.0);

        // Hull plating: two seam grids at different scales, plus a per-plate
        // albedo jitter.  This is the detail a model would carry in its
        // texture; here it costs three hashes.
        vec3 q = hp;
        vec2 plate = (abs(n.y) > 0.55) ? q.xz : ((abs(n.x) > 0.55) ? q.zy : q.xy);
        vec2 c1 = floor(plate * 0.9);
        vec2 g1 = abs(fract(plate * 0.9) - 0.5);
        float seam = smoothstep(0.46, 0.50, max(g1.x, g1.y));
        vec2 g2 = abs(fract(plate * 3.6) - 0.5);
        float seam2 = smoothstep(0.45, 0.50, max(g2.x, g2.y));
        float plateTone = 0.78 + 0.32 * hash21(c1);

        vec3 albedo = vec3(0.40, 0.43, 0.48) * plateTone;
        if (hitPart > 2.5) albedo = vec3(0.30, 0.31, 0.34) * plateTone;   // engine block
        albedo *= 1.0 - 0.42 * seam - 0.16 * seam2;

        // Weathering streaks down the flanks.
        albedo *= 0.86 + 0.20 * fbm3(hp * vec3(0.35, 1.9, 0.35));

        col = albedo * (0.22 + 1.55 * dif * (0.85 + 0.25 * audioBass));
        col += nebTint * albedo * fill * 0.55;
        col += vec3(0.65, 0.78, 1.0) * fres * 0.40;

        // Ambient occlusion from the step count: the crevices between the
        // spine, tower and sponsons darken by themselves.
        col *= clamp(1.0 - float(steps) * 0.0065, 0.35, 1.0);

        // ---- lit windows on the tower and spine ----
        if (hitPart > 0.5 && hitPart < 2.5) {
            vec2 wc = floor(vec2(hp.z * 2.6, hp.y * 3.4));
            vec2 wf = fract(vec2(hp.z * 2.6, hp.y * 3.4));
            float lit = step(0.62, hash21(wc + 3.1));
            float win = lit * step(0.22, wf.x) * step(wf.x, 0.78)
                            * step(0.30, wf.y) * step(wf.y, 0.70);
            col += vec3(1.0, 0.92, 0.70) * win * (0.55 + 0.30 * audioLevel) * glw;
        }

        // ---- running lights: two rows along the flanks ----
        float rowY = abs(abs(hp.y) - 0.62);
        float beadZ = fract(hp.z * 1.15);
        float bead = smoothstep(0.10, 0.0, rowY) * smoothstep(0.16, 0.02, abs(beadZ - 0.5));
        // A pulse runs bow-ward along the row on every kick.
        float chase = exp(-abs(fract(hp.z * 0.08 - audioBeatPhase) - 0.5) * 9.0);
        col += vec3(0.35, 0.85, 1.0) * bead * (0.35 + 1.5 * chase * audioKick) * glw;

        // ---- navigation strobe on the spine ----
        float strobe = pow(max(0.0, 1.0 - abs(fract(audioBeatPhase) - 0.06) * 9.0), 3.0);
        float atTop = smoothstep(1.35, 1.65, hp.y) * smoothstep(0.9, 0.4, abs(hp.x));
        col += vec3(1.0, 0.35, 0.30) * atTop * strobe * 0.85 * glw;

        // ---- engine bells: emissive, they carry the music ----
        if (hitPart > 3.5) {
            vec3 bp = hp - vec3(0.0, 0.15, -1.13 * len);
            bp.xy = abs(bp.xy) - vec2(1.45, 0.72);
            float r = length(bp.xy) / 0.62;
            float core = pow(clamp(1.0 - r, 0.0, 1.0), 1.6);
            vec3 flame = mix(vec3(0.30, 0.65, 1.0), vec3(0.85, 0.95, 1.0), core);
            col += flame * core * (1.1 + 1.5 * audioSwell + 1.8 * audioKick) * glw;
        }
    }

    // ---- exhaust plume, drawn as a screen-space glow behind the stern ----
    {
        // Project the stern into the frame and bloom around it.
        vec3 stern = vec3(0.0, 0.15, -1.16 * len) - ro;
        float sz = dot(stern, ww);
        if (sz > 0.1) {
            vec2 sp = vec2(dot(stern, uu), dot(stern, vv)) / (sz * 1.45 / 1.0);
            float pd = length((ruv - sp) * vec2(1.0, 2.1));
            float plume = exp(-pd * (5.5 - 1.6 * audioSwell));
            vec3 pc = mix(vec3(0.25, 0.60, 1.0), vec3(0.75, 0.90, 1.0), 0.4);
            col += pc * plume * (0.30 + 0.55 * audioSwell + 0.40 * audioKick) * glw;
        }
    }

    // Bounded hue nudge: a full rotation would repaint a steel hull and its
    // sun any colour at all -- the identity has to survive the preset.
    if (hue > 0.001) col = hueRot(col, 0.22 * sin(hue));

    // Soft-knee exposure: the engine bells and the plume compress instead of
    // clipping the whole stern to white.
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.42 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
