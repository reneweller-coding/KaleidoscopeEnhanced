#version 330 core
out vec4 fragColor;
/**
 * @file MatrioshkaBrain.frag
 * @brief MATRIOSHKA BRAIN: a star wrapped in nested shells of computer,
 * seen from outside.  Three concentric spheres of panels, each turning on
 * its own slow axis: the outer shell cold and dark red with its waste heat,
 * the middle one orange, the inner one yellow-hot -- and where panels are
 * missing, the view falls through to the next shell and finally to the
 * star's white-gold surface.  Seams between the panels carry streams of
 * light, the data flowing round the shells.
 *
 *   sceneTime/sceneAdvance -> the shells turning, data along the seams
 *   audioSwell    -> the star's glow through the gaps (slow)
 *   audioKick     -> the data streams flare (light only)
 *   audioChromaHue-> photo tint of the panels
 *
 * Per-activation variety:
 *   techP float panel density (0.5..1.5)
 *   dataP float brightness of the data streams (0.5..2.0)
 *   hueP float palette offset (0..6.28)
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

uniform float techP;
uniform float dataP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

float hash21(vec2 p)
{
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}
float hash31(vec3 p)
{
    p = fract(p * 0.1031);
    p += dot(p, p.zyx + 31.32);
    return fract((p.x + p.y) * p.z);
}
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}

mat3 rotAxis(vec3 a, float ang)
{
    a = normalize(a);
    float c = cos(ang), s = sin(ang), t = 1.0 - c;
    return mat3(t * a.x * a.x + c,       t * a.x * a.y + s * a.z, t * a.x * a.z - s * a.y,
                t * a.x * a.y - s * a.z, t * a.y * a.y + c,       t * a.y * a.z + s * a.x,
                t * a.x * a.z + s * a.y, t * a.y * a.z - s * a.x, t * a.z * a.z + c);
}

// Panels on a sphere: cube-sphere grid (gnomonic), whose lines are great
// circles and so join seamlessly across the cube's edges.  Returns (panel
// id hash, distance to the nearest seam in grid units, seam coordinate).
vec3 panels(vec3 n, float N)
{
    vec3 a = abs(n);
    vec2 f; float face;
    if (a.x >= a.y && a.x >= a.z) { f = n.yz / a.x; face = n.x > 0.0 ? 0.0 : 1.0; }
    else if (a.y >= a.z)          { f = n.xz / a.y; face = n.y > 0.0 ? 2.0 : 3.0; }
    else                          { f = n.xy / a.z; face = n.z > 0.0 ? 4.0 : 5.0; }
    vec2 g = (f * 0.5 + 0.5) * N;
    vec2 gi = floor(g), gf = fract(g);
    float seam = min(min(gf.x, 1.0 - gf.x), min(gf.y, 1.0 - gf.y));
    float along = (min(gf.x, 1.0 - gf.x) < min(gf.y, 1.0 - gf.y)) ? g.y : g.x;
    return vec3(hash31(vec3(gi, face)), seam, along);
}

bool sphere(vec3 ro, vec3 rd, float R, out float t0)
{
    float b = dot(ro, rd), c = dot(ro, ro) - R * R;
    float h = b * b - c;
    if (h < 0.0) return false;
    t0 = -b - sqrt(h);
    return t0 > 0.0;
}

void main()
{
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    float tp = (techP > 0.01) ? techP : 1.0;
    float dp = (dataP > 0.01) ? dataP : 1.0;
    float hue = (hueP > 0.001) ? hueP : 0.0;
    float swell = clamp(audioSwell, 0.0, 1.0);
    float kick = clamp(audioKick, 0.0, 1.0);
    float T = sceneTime + sceneAdvance * 0.5;

    vec3 ro = vec3(0.0, 0.0, -4.3);
    vec3 rd = normalize(vec3(uv, 1.7));

    // Background: stars and a faint haze of the brain's waste heat.
    vec3 col = vec3(0.006, 0.004, 0.01);
    {
        vec2 g = uv * 80.0;
        vec2 gi = floor(g), gf = fract(g);
        vec2 c = 0.2 + 0.6 * vec2(hash21(gi + 1.0), hash21(gi + 2.0));
        col += vec3(0.9, 0.9, 1.0) * smoothstep(0.1, 0.0, length(gf - c)) * step(0.975, hash21(gi)) * 0.6;
    }
    col += vec3(0.25, 0.06, 0.03) * exp(-length(uv) * 2.2) * 0.5;

    float radii[3] = float[3](1.0, 0.8, 0.62);
    vec3 shellHot[3] = vec3[3](vec3(0.45, 0.09, 0.05), vec3(0.95, 0.4, 0.12), vec3(1.0, 0.8, 0.35));
    vec3 axes[3] = vec3[3](vec3(0.3, 1.0, 0.2), vec3(-0.5, 1.0, 0.4), vec3(0.2, 1.0, -0.6));
    float rates[3] = float[3](0.015, -0.025, 0.04);
    float grids[3] = float[3](9.0, 7.0, 5.0);
    float gapFr[3] = float[3](0.28, 0.35, 0.45);
    vec3 dataC = mix(vec3(0.5, 0.9, 1.0), imgPalette(0.55 + hue * 0.159), 0.3);

    vec3 acc = vec3(0.0);
    float trans = 1.0;
    bool reachedStar = true;
    for (int s = 0; s < 3; ++s) {
        float t0;
        if (!sphere(ro, rd, radii[s], t0)) {
            // Through a gap but past the next shell: the far inside wall of
            // the shell we are in, lit orange by the star within.
            acc += trans * shellHot[max(s - 1, 0)] * 1.4 * (0.8 + 0.4 * swell);
            trans = 0.0;
            reachedStar = false;
            break;
        }
        vec3 hp = ro + rd * t0;
        vec3 n = normalize(hp);
        vec3 ln = rotAxis(axes[s], T * rates[s]) * n;
        vec3 pn = panels(ln, floor(grids[s] * tp + 0.5));
        bool gap = pn.x < gapFr[s];
        // Panel face: dark with its own waste-heat glow, hotter inward;
        // limb brightening from the heat seen through more material.
        float facing = max(dot(n, -rd), 0.0);
        vec3 panel = shellHot[s] * (0.25 + 0.5 * pn.x) * (0.5 + 0.8 * pow(1.0 - facing, 2.0));
        panel = mix(panel, panel * imgPalette(0.1 + hue * 0.159 + 0.2 * float(s)) * 1.5, 0.15);
        // Radiator fins: fine lines across the panel.
        panel *= 0.85 + 0.15 * step(0.5, fract(pn.z * 6.0));
        // Seams: bright data lines, packets flowing along them.
        float seam = smoothstep(0.06, 0.0, pn.y);
        float packet = pow(0.5 + 0.5 * sin(pn.z * 3.0 - T * 2.0 * (s == 1 ? -1.0 : 1.0) + pn.x * 6.0), 12.0);
        vec3 seamC = dataC * seam * (0.35 + 1.4 * packet * dp) * (0.7 + 0.8 * kick);
        if (!gap) {
            acc += trans * (panel + seamC);
            trans = 0.0;
            reachedStar = false;
            break;
        }
        // Through the gap: the seam rims still glow, the rest shows deeper.
        acc += trans * seamC * 0.6;
        // Light from inside spills out of the gap rim.
        acc += trans * shellHot[min(s + 1, 2)] * smoothstep(0.15, 0.0, pn.y) * 0.5;
    }
    if (reachedStar && trans > 0.0) {
        float t0;
        if (sphere(ro, rd, 0.42, t0)) {
            vec3 n = normalize(ro + rd * t0);
            float gran = noise2(n.xy * 40.0 + T * 0.05) * 0.5 + noise2(n.yz * 90.0) * 0.5;
            vec3 star = mix(vec3(1.0, 0.75, 0.35), vec3(1.0, 0.98, 0.9), gran) * (1.6 + 0.8 * swell);
            star *= 0.6 + 0.4 * max(dot(n, -rd), 0.0);
            acc += trans * star;
        } else {
            acc += trans * vec3(1.0, 0.7, 0.35) * 0.4 * (0.8 + 0.4 * swell);
        }
    }
    // Outer glow: the shell's heat halo.
    float rr = length(uv) / (1.0 / sqrt(4.3 * 4.3 - 1.0) * 1.7);
    col += vec3(0.5, 0.12, 0.05) * exp(-max(rr - 1.0, 0.0) * 8.0) * 0.25 * step(1.0, rr);
    float hit;
    float tt;
    hit = sphere(ro, rd, 1.0, tt) ? 1.0 : 0.0;
    col = mix(col, acc, hit);

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
