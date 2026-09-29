#version 330 core
out vec4 fragColor;
/**
 * @file MuqarnasDome.frag
 * @brief MUQARNAS DOME: looking straight up into a honeycomb vault of
 * stalactite niches, tier upon tier of pointed cells stepping inward to a
 * star-shaped oculus full of daylight.  Every cell is a small concave niche
 * lit from the centre, its rim gilded, its hollow tiled in the colours of
 * the photo; alternate tiers are offset by half a cell so the rows
 * interlock.  The vault turns very slowly; the gold of each tier glows with
 * its spectrum band, and the oculus breathes with the swell.
 *
 * Audio Reactivity:
 *   audioSpectrum[32] -> gold glow of each tier (light)
 *   audioSwell        -> daylight through the oculus (slow)
 *   sceneAdvance      -> the slow turn of the vault (continuous)
 *   audioHigh         -> glints on the gilded edges (light)
 *
 * Per-activation variety: tiersP (cells per tier), hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioSpectrum[32];
uniform float audioSwell;
uniform float audioHigh;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float tiersP;
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

float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// Pointed (ogee-ish) arch: distance to the arch boundary for local x in
// [-1,1], y in [0,1]; negative inside.
float archD(vec2 q)
{
    float w = 1.0 - 0.55 * q.y * q.y;             // narrows to a point at the top
    return max(abs(q.x) - w, -q.y);
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float baseN = 22.0 + floor(clamp(tiersP, 0.0, 1.0) * 4.0) * 4.0;     // once per activation
    float swell = clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float turn = sceneAdvance * 0.02 + sceneTime * 0.006;

    float r = length(p);
    float a = atan(p.y, p.x) + turn;

    // Perspective looking up a dome: the tiers get thinner toward the
    // centre.  u = log radius makes every tier the same height in u.
    float u = log(max(r, 1e-4)) * 5.2;
    float tier = floor(u + 20.0);
    float tv = fract(u);                          // 0 at the inner edge of a tier
    // Cells per tier: fewer toward the oculus (inner tiers), never below 6.
    float n = max(8.0, baseN + (tier - 20.0) * 3.0);
    float shift = mod(tier, 2.0) * 0.5;           // alternate tiers interlock
    float ca = a / 6.2831853 * n + shift;
    float cell = floor(ca);
    float cx = fract(ca) * 2.0 - 1.0;             // -1..1 across the cell

    // The niche: the arch opens toward the centre (the vault hangs down).
    vec2 q = vec2(cx, 1.0 - tv);
    float d = archD(q);
    float inside = smoothstep(0.03, -0.03, d);
    // Concave shading: light from the oculus falls on the outer wall of the
    // niche and leaves its top in shadow.
    float depth = clamp(-d, 0.0, 1.0);
    float shade = 0.35 + 0.65 * (1.0 - q.y) * (0.6 + 0.4 * depth) + 0.25 * cx * (mod(cell, 2.0) - 0.5);
    int band = int(mod(tier * 3.0 + 7.0, 32.0));
    float e = clamp(audioSpectrum[band] * 1.6, 0.0, 1.0);

    // Tile inside the niche: the photo, in small glazed squares.
    vec2 tq = vec2(cx * 3.0, q.y * 3.5);
    vec2 tc = floor(tq), tf = fract(tq);
    float grout = smoothstep(0.0, 0.08, min(min(tf.x, 1.0 - tf.x), min(tf.y, 1.0 - tf.y)));
    vec2 photoUV = vec2(fract(cell / n + tc.x * 0.03), clamp(0.2 + 0.6 * fract(tier * 0.13) + tc.y * 0.05, 0.0, 1.0));
    vec3 glaze = mix(img(photoUV), imgPalette(hue * 0.159 + fract(tier * 0.21 + cell * 0.013) * 0.4), 0.45);
    glaze *= 0.7 + 0.35 * hash21(tc + cell * 3.1 + tier * 17.0);
    vec3 niche = glaze * grout * shade * 1.15;

    // Gilded rims: the arch outline and the tier ledge.
    float rim = exp(-abs(d) * 28.0);
    float ledge = exp(-tv * 30.0) + exp(-(1.0 - tv) * 45.0);
    vec3 gold = mix(vec3(1.0, 0.74, 0.32), imgPalette(hue * 0.159 + 0.08), 0.18);
    float glint = pow(max(0.0, sin(a * n * 0.5 + tier * 1.7 + sceneTime * 0.3)), 24.0) * hi;
    vec3 goldC = gold * (rim * 0.9 + ledge * 0.45) * (0.45 + 0.9 * e) + gold * glint * rim * 1.5;

    // The spandrels between neighbouring niches are small faceted plates of
    // their own: lit plaster with a gilded seam, never a black hole.
    float spand = clamp(d * 3.0, 0.0, 1.0);
    vec3 plaster = mix(vec3(0.72, 0.62, 0.5), imgPalette(hue * 0.159 + 0.3), 0.3)
                 * (0.35 + 0.5 * (1.0 - q.y)) * (0.8 + 0.3 * spand);
    vec3 col = mix(plaster, niche, inside) + goldC;

    // Depth toward the oculus: the vault darkens outward (away from the
    // light) and every tier is lit a little more near the centre.
    float lightFall = exp(-r * 1.1);
    col *= 0.45 + 1.1 * lightFall;

    // The oculus: an eight-point star of sky.
    float sa = atan(p.y, p.x) + turn;
    float star = 0.09 + 0.025 * cos(sa * 8.0);
    float ocu = smoothstep(star + 0.006, star - 0.006, r);
    vec3 sky = mix(vec3(1.0, 0.97, 0.9), imgPalette(hue * 0.159 + 0.55) * 1.2, 0.3) * (0.9 + 0.8 * swell);
    col = mix(col, sky, ocu);
    // Light spilling from it into the air of the dome.
    col += sky * exp(-r * 9.0) * (0.25 + 0.4 * swell);

    col *= 0.9 + 0.25 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
