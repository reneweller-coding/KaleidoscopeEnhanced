#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file WeatherProjectSun.frag
 * @brief WEATHER PROJECT SUN: after Olafur Eliasson's installation in a
 * turbine hall -- a vast dark hall filled with haze, at its far end a
 * glowing half-disc of a sun hung just under the ceiling, and the whole
 * ceiling one mirror, so the half-disc becomes a full sun and the hall
 * doubles upward.  The mono-frequency light turns everything into shades
 * of amber and black; people stand and lie on the floor as silhouettes,
 * looking up at their own tiny reflections.  The camera is still; the
 * haze drifts and the people move about slowly.
 *
 * The hall is traced analytically (a box with a mirror lid), the haze's
 * in-scattering of the sun integrated in closed form along each ray.
 *
 * Audio Reactivity:
 *   audioSwell  -> the density of the haze (slow)
 *   audioBass   -> the glow of the sun (light)
 *   audioLevel  -> brightness
 *   sceneTime / sceneAdvance -> the drifting haze and the people walking
 *
 * Per-activation variety: crowdP (how many people), hueP.
 */

uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float sceneTime;   ///< Seconds since this scene was activated.
uniform float sceneAdvance;   ///< The music's advance since this scene was activated (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioBass;   ///< Bass band level, 0..1.
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float crowdP;
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

/// @brief The photo at a coordinate: the cross-fade of tex0 and tex1.
vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

/// @brief The house palette: a colour of the photo on an arc that turns with the music's hue.
vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

/// @brief Pseudo-random number 0..1 from a float.
float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
/// @brief Pseudo-random number 0..1 from a 2D point.
float hash21(vec2 p)
{
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}
/// @brief Smooth 2D value noise, 0..1.
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
/// @brief Fractal noise: octaves of value noise.
float fbm(vec2 p)
{
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; ++i) { v += a * noise2(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 2.3; a *= 0.5; }
    return v;
}

// The hall (metres): floor, mirror ceiling, side walls, the end wall with the sun.
const float FLOOR = -1.6;
const float CEIL  = 18.0;
const float HALFW = 11.0;
const float ENDZ  = 55.0;
const vec3  SUNC  = vec3(0.0, 17.6, 55.0);
const float SUNR  = 8.0;

float gT;   ///< The chain's (or scene's) time this frame.
int   gCrowd;

/// Nearest hit of a ray inside the box: 0 floor, 1 ceiling, 2 wall, 3 end wall.
float traceBox(vec3 ro, vec3 rd, out int mat)
{
    float t = 1e9; mat = 3;
    float tE = (ENDZ - ro.z) / rd.z; t = tE;
    if (rd.y < 0.0) { float tf = (FLOOR - ro.y) / rd.y; if (tf < t) { t = tf; mat = 0; } }
    if (rd.y > 0.0) { float tc = (CEIL - ro.y) / rd.y; if (tc < t) { t = tc; mat = 1; } }
    float tw = (sign(rd.x) * HALFW - ro.x) / rd.x; if (tw < t) { t = tw; mat = 2; }
    return t;
}

/// People as upright cut-outs facing the sun; some lie on the floor.
/// Returns the distance along the ray to the nearest figure (or 1e9) and
/// its soft coverage.
float people(vec3 ro, vec3 rd, float tMax, out float cov)
{
    float tBest = 1e9; cov = 0.0;
    for (int i = 0; i < 48; ++i) {
        if (i >= gCrowd) break;
        float fi = float(i);
        float h = hash11(fi * 1.37 + 0.5);
        float zi = 7.0 + 42.0 * hash11(fi * 2.11 + 0.3);
        float xi = (hash11(fi * 3.7 + 0.1) - 0.5) * 18.0 + 0.9 * sin(gT * 0.015 + h * 6.28);
        float t = (zi - ro.z) / rd.z;
        if (t <= 0.0 || t >= min(tMax, tBest)) continue;
        vec2 q = vec2(ro.x + rd.x * t - xi, ro.y + rd.y * t - FLOOR);
        float px = 0.0012 * t + 0.004;                                  // one pixel at this depth
        float d;
        if (h < 0.12) {
            // Lying on the back, looking up at the mirror: a long low shape.
            d = length(vec2(max(abs(q.x) - 0.7, 0.0), (q.y - 0.12) * 1.3)) - 0.14;
        } else {
            float s = 0.9 + 0.2 * hash11(fi * 5.3);
            q /= s;
            float bw = mix(0.13, 0.21, smoothstep(0.8, 1.3, q.y)) - 0.06 * smoothstep(1.3, 1.42, q.y);
            float body = length(vec2(max(abs(q.x) - bw, 0.0), max(abs(q.y - 1.05) - 0.33, 0.0))) - 0.05;
            float legs = length(vec2(abs(q.x) - 0.09 - 0.03 * (1.0 - q.y / 0.8), max(abs(q.y - 0.4) - 0.4, 0.0))) - 0.065;
            float head = length((q - vec2(0.0, 1.58)) * vec2(1.0, 0.85)) - 0.11;
            d = min(min(body, legs), head) * s;
        }
        float c = smoothstep(px, -px, d);
        if (c > 0.02) { tBest = t; cov = c; }
    }
    return tBest;
}

/// The sun's light falling off from the disc's centre (approximately a point).
float sunLight(vec3 P) { vec3 v = P - SUNC; return 500.0 / (dot(v, v) + 500.0); }

/// Closed-form in-scattering of the sun along a ray segment [0, t1] in
/// uniform haze: the integral of A / (h^2 + b + (t - t0)^2) dt.
float inscatter(vec3 ro, vec3 rd, float t1)
{
    float t0 = dot(SUNC - ro, rd);
    vec3 c = ro + rd * t0 - SUNC;
    float s = sqrt(dot(c, c) + 500.0);
    return 500.0 / s * (atan((t1 - t0) / s) - atan(-t0 / s));
}

/// Shade one surface hit (without the mirror bounce).
float shade(vec3 P, int mat, float t)
{
    float L = sunLight(P);
    if (mat == 3) {
        // End wall: the half-disc sun below the ceiling, the wall dark around it.
        float r = length(P.xy - SUNC.xy);
        float disc = smoothstep(SUNR + 0.08 + 0.002 * t, SUNR - 0.08, r) * step(P.y, CEIL);
        // The lamps behind the screen give the disc a faint structure.
        float lamps = 0.93 + 0.07 * sin(atan(P.y - SUNC.y, P.x) * 60.0) * smoothstep(0.0, SUNR, r);
        return 0.12 * L + disc * 5.0 * lamps;
    }
    if (mat == 2) {
        // Side walls: steel columns in a rhythm, catching a little light.
        float col = smoothstep(0.35, 0.25, abs(fract(P.z / 6.0) - 0.5) * 6.0 - 2.4);
        return L * (0.3 + 0.35 * col) * (0.8 + 0.2 * noise2(P.zy * 0.8));
    }
    if (mat == 0) {
        // Concrete floor: lit from the far end, a soft sheen of the sun.
        float tex = 0.8 + 0.2 * noise2(P.xz * 1.5) * smoothstep(40.0, 10.0, t);
        return L * 0.9 * tex;
    }
    return 0.0;
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float bass = clamp(audioBass, 0.0, 1.0);
    gT = sceneTime + sceneAdvance * 0.4;
    gCrowd = 18 + int(clamp(crowdP, 0.0, 1.0) * 30.0);

    vec3 ro = vec3(0.0, 0.0, 0.0);
    vec3 rd = normalize(vec3(p.x, p.y + 0.2, 1.1));

    // Haze density drifts; the swell thickens it.
    float rho = 0.028 * (0.6 + 0.5 * fbm(p * 2.5 + vec2(gT * 0.012, gT * 0.005))) * (0.7 + 0.8 * swell);
    float sunI = 0.85 + 0.5 * bass;

    int mat;
    float t = traceBox(ro, rd, mat);
    float cov;
    float tp = people(ro, rd, t, cov);
    float surf = shade(ro + rd * t, mat, t) * sunI;
    float tAll = t;
    if (mat == 1) {
        // The mirror ceiling: continue the ray downward from the hit point.
        vec3 P = ro + rd * t;
        vec3 rd2 = vec3(rd.x, -rd.y, rd.z);
        int mat2;
        float t2 = traceBox(P + rd2 * 0.01, rd2, mat2);
        float cov2;
        float tp2 = people(P, rd2, t2, cov2);
        float s2 = shade(P + rd2 * t2, mat2, t + t2) * sunI;
        s2 *= 1.0 - cov2 * (tp2 < 1e8 ? 1.0 : 0.0);
        float T2 = exp(-rho * t2);
        s2 = s2 * T2 + rho * sunI * 2.2 * inscatter(P, rd2, t2);
        // Panel seams in the mirror, faint and fading with distance.
        vec2 pq = P.xz / 3.0;
        vec2 fw = fwidth(pq) + 1e-4;
        vec2 sd = abs(fract(pq) - 0.5);
        float seam = max(smoothstep(0.5 - fw.x * 1.5, 0.5, sd.x), smoothstep(0.5 - fw.y * 1.5, 0.5, sd.y)) * smoothstep(60.0, 20.0, t);
        surf = s2 * 0.85 * (1.0 - 0.5 * seam);
    }
    // A figure in front of the surface is a silhouette in the haze.
    if (tp < 1e8) { surf *= 1.0 - cov; }
    float Tr = exp(-rho * t);
    float lum = surf * Tr + rho * sunI * 2.2 * inscatter(ro, rd, t) + (1.0 - Tr) * 0.12;

    // Mono-frequency light: everything is amber and black.
    vec3 amber = mix(vec3(1.0, 0.62, 0.18), imgPalette(0.1 + hueP * 0.159) * vec3(1.2, 0.85, 0.4), 0.1);
    vec3 col = amber * lum + vec3(1.0, 0.85, 0.55) * max(lum - 2.0, 0.0) * 0.5;

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
