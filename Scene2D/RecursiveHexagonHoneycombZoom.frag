#version 330 core
out vec4 fragColor;
/**
 * @file RecursiveHexagonHoneycombZoom.frag
 * @brief RECURSIVE HEXAGON HONEYCOMB: a macro photograph of a honeycomb.
 * Pale wax walls in their hexagon lattice; cells brimming with amber honey
 * that catches the light in a bright glint, cells sealed under matte wax
 * caps, a few empty ones showing the depth of the cell.  Bees crawl over
 * the comb on their own unhurried paths, round-bodied, banded, their wings
 * a shimmer.  The view drifts slowly across the comb and settles ever
 * deeper -- a gentle, constant approach, with each hexagon repeating the
 * one before.  The music is the light in the honey.
 *
 * The earlier version was a neon log-zoom of hexagon lines with shatter
 * flashes (audio driving the zoom) -- the kind of motion the catalogue
 * avoids and little to look at.
 *
 * Audio Reactivity:
 *   audioSwell    -> the warm light on the comb (slow)
 *   audioKick     -> glints in the honey (light only)
 *   audioChromaHue-> photo tint of the honey
 *   sceneTime/sceneAdvance -> drift, approach, bees (continuous)
 *
 * Per-activation variety: speedP (drift and bees), scaleP (cell size),
 * wallWidthP, glowP (honey glow), hueP.
 */

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneTime;
uniform float sceneAdvance;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioKick;
uniform float audioValence;
uniform float audioChromaHue;

uniform float speedP;
uniform float scaleP;
uniform float wallWidthP;
uniform float glowP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t) {
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float hash21(vec2 p)
{
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}

// Hex lattice: returns (local offset from cell centre, cell id).
vec4 hexCell(vec2 p)
{
    const vec2 s = vec2(1.0, 1.7320508);
    vec2 h = s * 0.5;
    vec2 a = mod(p, s) - h;
    vec2 b = mod(p - h, s) - h;
    vec2 g = (dot(a, a) < dot(b, b)) ? a : b;
    return vec4(g, p - g);
}
// Distance from the hex centre to its edge along the local offset (0 at centre, 0.5 at the edge).
float hexDist(vec2 g)
{
    g = abs(g);
    return max(dot(g, vec2(0.5, 0.8660254)), g.x);
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float spd = (speedP > 0.01) ? speedP : 1.0;
    float sc  = (scaleP > 0.01) ? scaleP : 1.0;
    float wallW = 0.045 * ((wallWidthP > 0.01) ? wallWidthP : 1.0);
    float glw = (glowP > 0.01) ? glowP : 1.0;
    float hue = (hueP > 0.001) ? hueP : 0.0;
    float swell = clamp(audioSwell, 0.0, 1.0);
    float kick = clamp(audioKick, 0.0, 1.0);
    float T = sceneTime + sceneAdvance * 0.5;

    // The view: a slow drift and a gentle, bounded breathing of the scale
    // (never an audio-driven zoom).
    float cells = 7.0 / sc * (1.0 - 0.12 * sin(T * 0.01));
    vec2 w = p * cells + vec2(T * 0.05 * spd, T * 0.02 * spd);

    vec4 hc = hexCell(w);
    vec2 g = hc.xy;
    vec2 id = floor(hc.zw * 2.0 + 0.5);
    float hd = hexDist(g);                                  // 0 centre .. 0.5 wall
    float rnd = hash21(id);
    float kind = (rnd < 0.62) ? 0.0 : ((rnd < 0.92) ? 1.0 : 2.0);   // honey, capped, empty

    vec3 L = normalize(vec3(-0.5, 0.6, 0.65));
    vec3 honeyC = mix(vec3(0.95, 0.55, 0.08), imgPalette(0.1 + hue * 0.159), 0.18);
    vec3 waxC = vec3(0.98, 0.88, 0.58);
    vec3 light = vec3(1.0, 0.93, 0.8) * (0.85 + 0.35 * swell);

    vec3 col;
    float inner = 0.5 - wallW;
    if (kind == 0.0) {
        // Honey: a slightly domed amber surface; deeper colour toward the
        // walls, a bright highlight, and a thin meniscus against the wax.
        float r = hd / inner;
        vec3 n = normalize(vec3(g * 0.9, 1.0));
        float spec = pow(max(dot(reflect(-L, normalize(vec3(g * 2.2, 1.0))), vec3(0.0, 0.0, 1.0)), 0.0), 24.0);
        vec3 c = honeyC * (0.55 + 0.6 * (1.0 - r * r)) * (0.8 + 0.3 * glw);
        c = mix(c, honeyC * vec3(0.7, 0.4, 0.2), smoothstep(0.6, 1.0, r) * 0.5);
        c += light * spec * (0.8 + 1.5 * kick);
        // A soft inner glow, as if lit from behind.
        c += honeyC * 0.25 * glw * exp(-r * 3.0);
        col = c * light;
    } else if (kind == 1.0) {
        // Capped: a matte wax dome with a fine crinkle.
        float r = hd / inner;
        vec3 n = normalize(vec3(g * 1.6 + 0.08 * (vec2(noise2(w * 12.0), noise2(w * 12.0 + 7.0)) - 0.5), 1.0));
        float dif = max(dot(n, L), 0.0);
        col = waxC * vec3(0.95, 0.85, 0.7) * (0.45 + 0.65 * dif) * light;
    } else {
        // Empty: we look down into a dark hexagonal tube.
        float r = hd / inner;
        col = waxC * mix(vec3(0.12, 0.07, 0.03), vec3(0.6, 0.45, 0.25), smoothstep(0.2, 1.0, r)) * light;
    }
    // The wax walls: pale ridges lit on one side.
    float wallT = smoothstep(inner - 0.012, inner + 0.004, hd);
    float lit = 0.6 + 0.4 * dot(normalize(g + 1e-4), normalize(vec2(0.5, -0.6)));
    vec3 wall = waxC * (0.85 + 0.45 * lit) * light;
    col = mix(col, wall, wallT);
    col += vec3(1.0, 0.95, 0.8) * exp(-abs(hd - 0.5) * 120.0) * 0.15;      // wall crest

    // Bees: round bodies, banded abdomen, shimmering wings, a soft shadow.
    for (int k = 0; k < 5; ++k) {
        float fk = float(k);
        float t = T * 0.08 * spd + fk * 17.0;
        vec2 c = vec2(sin(t * 0.7 + fk) * 0.55 * aspect, sin(t * 0.53 + fk * 2.0) * 0.36);
        vec2 c2 = vec2(sin((t + 0.1) * 0.7 + fk) * 0.55 * aspect, sin((t + 0.1) * 0.53 + fk * 2.0) * 0.36);
        vec2 dir = normalize(c2 - c + 1e-5);
        vec2 sd = vec2(-dir.y, dir.x);
        vec2 d = p - c;
        vec2 q = vec2(dot(d, dir), dot(d, sd)) / 0.065;
        // Shadow.
        vec2 qs = q - vec2(-0.25, 0.3);
        col *= 1.0 - 0.35 * smoothstep(1.3, 0.6, length(qs * vec2(0.6, 1.2)));
        // Wings (translucent, behind the body in our draw order).
        for (int wg = 0; wg < 2; ++wg) {
            float sgn = (wg == 0) ? 1.0 : -1.0;
            vec2 wq = q - vec2(0.15, sgn * 0.55);
            wq = mat2(0.8, -0.6 * sgn, 0.6 * sgn, 0.8) * wq;
            float wing = smoothstep(1.0, 0.9, length(wq * vec2(0.9, 2.2)));
            col = mix(col, vec3(0.85, 0.9, 1.0) + 0.2 * sin(vec3(0.0, 2.0, 4.0) + wq.x * 8.0), wing * 0.35);
        }
        // Abdomen with bands, thorax, head.
        float abd = length((q - vec2(-0.55, 0.0)) * vec2(0.85, 1.35));
        float bands = step(0.5, fract(q.x * 3.2 + 0.2));
        vec3 abdC = mix(vec3(0.95, 0.65, 0.1), vec3(0.08, 0.05, 0.03), bands);
        float thor = length((q - vec2(0.15, 0.0)) * vec2(1.3, 1.4));
        float head = length((q - vec2(0.72, 0.0)) * vec2(2.0, 2.0));
        float body = min(min(abd, thor), head);
        vec3 bc = (abd < thor && abd < head) ? abdC : ((thor < head) ? vec3(0.35, 0.22, 0.08) : vec3(0.08, 0.06, 0.04));
        // Round shading: fuzzy thorax, glossy abdomen.
        float sh = 0.55 + 0.45 * (1.0 - body);
        bc *= sh * light;
        bc += vec3(1.0) * pow(max(0.0, 1.0 - length(q - vec2(-0.7, 0.25)) * 3.0), 3.0) * 0.4;
        col = mix(col, bc, smoothstep(1.0, 0.92, body));
    }

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
