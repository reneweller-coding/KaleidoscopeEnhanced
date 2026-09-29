#version 330 core
out vec4 fragColor;
/**
 * @file AsteroidMiningBase.frag
 * @brief ASTEROID MINING BASE: a slow orbit round a big asteroid that has
 * been turned into a mine.  Its cratered grey-brown surface carries lit
 * domes with warm windows and blinking pad lights; a mining ship hangs
 * above it, cutting into the rock with a laser whose impact throws a hot
 * glow; smaller lumpy asteroids tumble in the field around it, sharp in the
 * light of a distant sun.  The camera circles steadily (never on audio);
 * the music is the light of the base and the laser.
 *
 * Replaces a cube-geometry version whose asteroids were boxes.
 *
 *   sceneTime/sceneAdvance -> the orbit, the tumbling rocks (continuous)
 *   audioKick     -> the laser's impact glow (light only)
 *   audioSwell    -> sunlight and dust glow (slow)
 *   audioChromaHue-> photo tint of the base lights
 *
 * Per-activation variety:
 *   dustP float density of the dust haze (0.5..1.5)
 *   laserP float laser intensity (0.6..1.8)
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

uniform float dustP;
uniform float laserP;
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
float noise3(vec3 p)
{
    vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash31(i), hash31(i + vec3(1, 0, 0)), f.x),
                   mix(hash31(i + vec3(0, 1, 0)), hash31(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(hash31(i + vec3(0, 0, 1)), hash31(i + vec3(1, 0, 1)), f.x),
                   mix(hash31(i + vec3(0, 1, 1)), hash31(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}

const float BR = 12.0;                 // base asteroid radius
float g_T = 0.0;
float g_mat = 0.0;                     // 1 base rock, 2 dome, 3 small rock

// Lumps: cheap low-frequency displacement for rock silhouettes.
float lumps(vec3 p)
{
    return sin(p.x * 0.55 + 1.0) * sin(p.y * 0.62 + 2.0) * sin(p.z * 0.5)
         + 0.5 * sin(p.x * 1.3 + p.z * 0.7) * sin(p.y * 1.1 + 3.0);
}

vec3 domeDir(int i)
{
    if (i == 0) return normalize(vec3(0.3, 0.8, 0.5));
    if (i == 1) return normalize(vec3(-0.6, 0.6, 0.4));
    if (i == 2) return normalize(vec3(0.7, 0.3, -0.6));
    if (i == 3) return normalize(vec3(-0.2, 0.5, -0.85));
    if (i == 4) return normalize(vec3(0.9, 0.1, 0.35));
    return normalize(vec3(-0.8, 0.2, -0.4));
}

float map(vec3 p)
{
    // The base asteroid.
    float d = length(p) - BR - 1.4 * lumps(p * 0.8);
    g_mat = 1.0;
    // Domes set into its surface.
    for (int i = 0; i < 6; ++i) {
        vec3 c = domeDir(i) * (BR - 0.2);
        float dd = length(p - c) - (1.3 + 0.3 * float(i % 3));
        if (dd < d) { d = dd; g_mat = 2.0; }
    }
    // The field: one lumpy rock per cell, none near the orbit ring.
    vec3 cs = vec3(18.0);
    vec3 id = floor(p / cs + 0.5);
    vec3 q = p - id * cs;
    float h = hash31(id + 7.0);
    vec3 cc = id * cs;
    float ringDist = abs(length(cc.xz) - 40.0) + abs(cc.y) * 0.5;
    if (h > 0.45 && ringDist > 10.0 && length(cc) > 22.0) {
        vec3 j = (vec3(hash31(id + 1.0), hash31(id + 2.0), hash31(id + 3.0)) - 0.5) * 6.0;
        vec3 r = q - j;
        float a = g_T * (0.05 + 0.1 * h);
        r.xz = mat2(cos(a), -sin(a), sin(a), cos(a)) * r.xz;
        float rad = 1.5 + 2.5 * hash31(id + 4.0);
        float ds = length(r) - rad - 0.45 * lumps(r * 1.0 + id);
        if (ds < d) { d = ds; g_mat = 3.0; }
    }
    return d;
}

vec3 calcNormal(vec3 p)
{
    vec2 e = vec2(0.02, 0.0);
    return normalize(vec3(map(p + e.xyy) - map(p - e.xyy),
                          map(p + e.yxy) - map(p - e.yxy),
                          map(p + e.yyx) - map(p - e.yyx)));
}

float segDist(vec3 ro, vec3 rd, vec3 a, vec3 b, out float tRay)
{
    // Closest distance between the ray and the segment a-b.
    vec3 ba = b - a, oa = ro - a;
    float baba = dot(ba, ba), bard = dot(ba, rd), baoa = dot(ba, oa), rdoa = dot(rd, oa);
    float den = baba - bard * bard;
    float s = clamp((baoa - bard * rdoa) / max(den, 1e-5), 0.0, 1.0) ;
    vec3 pb = a + ba * s;
    tRay = max(dot(pb - ro, rd), 0.0);
    return length(ro + rd * tRay - pb);
}

void main()
{
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    float dp = (dustP > 0.01) ? dustP : 1.0;
    float lp = (laserP > 0.01) ? laserP : 1.0;
    float hue = (hueP > 0.001) ? hueP : 0.0;
    float swell = clamp(audioSwell, 0.0, 1.0);
    float kick = clamp(audioKick, 0.0, 1.0);
    float T = sceneTime + sceneAdvance * 0.4;
    g_T = T;

    // The orbit: steady, slow, with a gentle rise and fall.
    float oa = T * 0.018 + 0.6;
    vec3 ro = vec3(40.0 * cos(oa), 7.0 + 4.0 * sin(T * 0.011), 40.0 * sin(oa));
    vec3 ta = vec3(0.0, 1.0, 0.0) + 6.0 * vec3(-sin(oa), 0.0, cos(oa));   // look a little ahead
    vec3 ww = normalize(ta - ro);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.5 * ww);

    vec3 sunDir = normalize(vec3(0.7, 0.35, -0.5));
    vec3 sunC = vec3(1.0, 0.95, 0.88) * (1.2 + 0.4 * swell);
    vec3 lightC = mix(vec3(1.0, 0.7, 0.35), imgPalette(0.1 + hue * 0.159), 0.25);

    // Space: stars, a faint nebula, the sun's glare.
    vec3 col = vec3(0.004, 0.005, 0.012);
    {
        vec3 sd = rd * 180.0;
        vec3 si = floor(sd);
        float st = hash31(si);
        vec3 sf = fract(sd) - 0.5;
        col += vec3(0.9, 0.92, 1.0) * smoothstep(0.15, 0.0, length(sf)) * step(0.992, st);
        col += vec3(0.12, 0.05, 0.14) * smoothstep(0.5, 0.9, noise3(rd * 3.0)) * 0.5;
        // A banded gas giant hangs in the sky (the fill light's source).
        vec3 gd = normalize(vec3(-0.6, -0.2, 0.7));
        float ca = dot(rd, gd);
        float gR = 0.34;
        if (ca > cos(gR)) {
            vec3 gu = normalize(cross(gd, vec3(0.0, 1.0, 0.0))), gv = cross(gu, gd);
            vec2 q = vec2(dot(rd, gu), dot(rd, gv)) / sin(gR);
            float z = sqrt(max(1.0 - dot(q, q), 0.0));
            vec3 gn = normalize(q.x * gu + q.y * gv - z * gd);
            float band = 0.5 + 0.5 * sin(q.y * 14.0 + 3.0 * noise3(vec3(q * 3.0, 1.0)));
            vec3 gcol = mix(vec3(0.75, 0.55, 0.35), vec3(0.95, 0.88, 0.72), band);
            float gl = max(dot(gn, sunDir), 0.0);
            col = gcol * (0.03 + 1.1 * gl) * (0.9 + 0.3 * swell) * smoothstep(1.0, 0.97, length(q));
        }
        col += sunC * pow(max(dot(rd, sunDir), 0.0), 800.0) * 4.0 + sunC * pow(max(dot(rd, sunDir), 0.0), 12.0) * 0.08;
    }

    // March.
    float t = 0.5, hit = 0.0;
    vec3 p = ro;
    float mat = 0.0;
    for (int i = 0; i < 110; ++i) {
        p = ro + rd * t;
        float d = map(p);
        mat = g_mat;
        if (d < 0.01 * t * 0.05 + 0.005) { hit = 1.0; break; }
        t += min(d * 0.65, 4.0);        // the field SDF only sees its own cell
        if (t > 160.0) break;
    }

    // The mining ship and its laser.
    float sa = T * 0.05;
    vec3 ship = vec3(17.0 * cos(sa), 9.0, 17.0 * sin(sa));
    vec3 target = normalize(ship - vec3(0.0, 4.0, 0.0)) * (BR - 0.5);

    if (hit > 0.5) {
        vec3 n = calcNormal(p);
        float dif = max(dot(n, sunDir), 0.0);
        // A soft shadow toward the sun.
        float sh = 1.0, st = 0.3;
        for (int k = 0; k < 20; ++k) {
            float h = map(p + sunDir * st);
            sh = min(sh, 10.0 * h / st);
            st += clamp(h, 0.3, 2.0);
            if (sh < 0.02 || st > 30.0) break;
        }
        sh = clamp(sh, 0.0, 1.0);
        // Fill from a gas giant's glow behind the camera's orbit, and a rim.
        float amb = 0.05 + 0.04 * n.y;
        vec3 fill = vec3(0.55, 0.42, 0.3) * max(dot(n, normalize(vec3(-0.6, -0.2, 0.7))), 0.0) * 0.3;
        float rim = pow(1.0 - max(dot(n, -rd), 0.0), 3.0) * 0.25;
        if (mat == 2.0) {
            // Domes: glassy, warm windows, a highlight.
            // Round lit windows scattered over the dark glass.
            vec3 wq = p * 2.2;
            vec3 wi = floor(wq);
            float wh = hash31(wi + 3.0);
            float win = smoothstep(0.3, 0.12, length(fract(wq) - 0.5)) * step(0.55, wh);
            col = vec3(0.06, 0.07, 0.09) * (dif * sh + amb) + lightC * win * 1.1 * (0.7 + 0.4 * swell);
            col += lightC * 0.06;
            col += sunC * pow(max(dot(reflect(-sunDir, n), -rd), 0.0), 60.0) * sh;
        } else {
            // Rock: cratered, grey-brown, lit hard by the sun.
            float cr = noise3(p * 0.9) * 0.6 + noise3(p * 2.7) * 0.4;
            vec3 rockC = mix(vec3(0.3, 0.27, 0.24), vec3(0.5, 0.45, 0.38), cr);
            if (mat == 3.0) rockC *= 0.85;
            col = rockC * (dif * sh * sunC + amb + fill) + vec3(0.3, 0.35, 0.45) * rim * 0.4;
            // Base lights on the big rock: blinking pad lights, round.
            if (mat == 1.0) {
                vec3 gp = p * 1.2;
                vec3 gi = floor(gp);
                float lh = hash31(gi);
                float blink = 0.5 + 0.5 * sin(T * 1.5 + lh * 30.0);
                float lamp = smoothstep(0.25, 0.05, length(fract(gp) - 0.5)) * step(0.965, lh);
                col += lightC * lamp * (0.4 + 0.8 * blink);
            }
        }
        // The laser's impact: a hot glow around the target point.
        float di = length(p - target);
        col += vec3(1.0, 0.5, 0.2) * exp(-di * 1.5) * (0.6 + 1.5 * kick) * lp;
        // Distance haze of the mining dust.
        col = mix(col, vec3(0.05, 0.045, 0.04) * (0.8 + 0.5 * swell), 1.0 - exp(-t * 0.004 * dp));
    }

    // The laser beam and the ship's lights (in front of whatever they hide).
    float tb;
    float db = segDist(ro, rd, ship, target, tb);
    if (hit < 0.5 || tb < t) {
        col += vec3(1.0, 0.35, 0.25) * exp(-db * 18.0) * 0.9 * lp * (0.7 + 0.6 * kick);
        col += vec3(1.0, 0.6, 0.4) * exp(-db * 3.0) * 0.08 * lp;
    }
    float tsh;
    float dsh = segDist(ro, rd, ship - vec3(1.5, 0.0, 0.0), ship + vec3(1.5, 0.0, 0.0), tsh);
    if (hit < 0.5 || tsh < t) {
        col = mix(col, vec3(0.15, 0.16, 0.18), smoothstep(0.7, 0.5, dsh));
        col += lightC * exp(-dsh * 6.0) * 0.3;
    }
    // Dust glow around the impact, seen against space.
    col += vec3(1.0, 0.5, 0.25) * 0.02 * dp * exp(-length(cross(rd, target - ro)) * 0.2) * (1.0 + kick);

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
