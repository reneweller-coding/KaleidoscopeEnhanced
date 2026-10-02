#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file CanyonRiverGoldenHour.frag
 * @brief CANYON RIVER GOLDEN HOUR: flying low through a winding desert canyon
 * in the last hour of sun -- red sandstone walls rising in ledges and
 * cliffs, banded by their strata, one wall blazing gold where the low sun
 * strikes it, the other deep in blue shadow, and far below a green river
 * winding along the floor, glittering where it catches the light.  Warm
 * haze fills the distance.  The camera glides along the river's course at
 * an even speed, following its bends smoothly.
 *
 * The canyon is a height field (terraced walls around a winding path),
 * ray-marched, with a soft shadow toward the sun.
 *
 * Audio Reactivity:
 *   audioHigh   -> glitter on the river (light)
 *   audioSwell  -> the warmth of the haze (slow)
 *   audioBass   -> the strength of the sunlight on the walls (light)
 *   audioLevel  -> brightness
 *   sceneTime / sceneAdvance -> the flight (constant speed)
 *
 * Per-activation variety: depthP (how deep the canyon), hueP.
 */

uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float sceneTime;   ///< Seconds since this scene was activated.
uniform float sceneAdvance;   ///< The music's advance since this scene was activated (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioHigh;   ///< High band level, 0..1.
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioBass;   ///< Bass band level, 0..1.
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float depthP;   ///< Depth knob, 0..1.
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
/// @brief Fractal noise of three octaves, 0..1.
float fbm3(vec2 p)
{
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 3; ++i) { v += a * noise2(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 2.3; a *= 0.5; }
    return v;
}

float gDepth;

float path(float z) { return 7.0 * sin(z * 0.035) + 3.5 * sin(z * 0.083 + 1.0); }

/// Terrain height: the river floor, then terraced walls climbing away.
float terrain(vec2 q)
{
    float dx = abs(q.x - path(q.y));
    dx += 3.0 * (fbm3(vec2(q.y * 0.06, dx * 0.05)) - 0.5);
    float rise = smoothstep(4.5, 20.0, dx) * gDepth;
    // Ledges: soft terraces (a smooth staircase keeps the march stable).
    float f = rise / 6.0;
    float ter = (floor(f) + smoothstep(0.55, 0.9, fract(f))) * 6.0;
    float h = mix(rise, ter, 0.75);
    h += 1.5 * fbm3(q * 0.08) * smoothstep(3.0, 8.0, dx);
    return h;
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float bass = clamp(audioBass, 0.0, 1.0);
    float T = sceneTime + sceneAdvance * 0.4;
    gDepth = 26.0 + 16.0 * clamp(depthP, 0.0, 1.0);

    // Glide along the river, turning smoothly with its bends.
    float z = T * 3.5;
    vec3 ro = vec3(path(z), 13.0, z);
    vec3 ta = vec3(path(z + 16.0), 9.0, z + 16.0);
    vec3 fw = normalize(ta - ro);
    vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
    vec3 up = cross(fw, rt);
    vec3 rd = normalize(p.x * rt + p.y * up + 1.1 * fw);

    vec3 sunDir = normalize(vec3(0.6, 0.75, 0.3));
    vec3 sunC = vec3(1.0, 0.72, 0.38) * (1.2 + 0.5 * bass);

    // March the height field.
    float t = 0.5, h = 0.0;
    bool hit = false;
    for (int i = 0; i < 120; ++i) {
        vec3 P = ro + rd * t;
        h = P.y - terrain(P.xz);
        if (h < 0.01 * t) { hit = true; break; }
        if (t > 260.0) break;
        t += max(0.35 * h, 0.05);
    }
    // Sky: gold near the sun, blue above.
    vec3 sky = mix(vec3(1.0, 0.75, 0.45), vec3(0.4, 0.55, 0.8), smoothstep(-0.05, 0.5, rd.y));
    sky += vec3(1.0, 0.8, 0.5) * pow(max(dot(rd, sunDir), 0.0), 12.0) * 0.8;
    vec3 col = sky;
    if (hit) {
        vec3 P = ro + rd * t;
        float e = 0.08 + 0.002 * t;
        vec3 n = normalize(vec3(terrain(P.xz - vec2(e, 0.0)) - terrain(P.xz + vec2(e, 0.0)), 2.0 * e,
                                terrain(P.xz - vec2(0.0, e)) - terrain(P.xz + vec2(0.0, e))));
        // Sandstone strata: bands by height, red to cream.
        float strata = P.y * 0.8 + 1.5 * noise2(P.xz * 0.05);
        vec3 rock = mix(vec3(0.6, 0.24, 0.12), vec3(0.88, 0.55, 0.32), smoothstep(-0.6, 0.6, sin(strata * 1.3)));
        rock = mix(rock, vec3(0.85, 0.72, 0.55), smoothstep(0.7, 1.0, sin(strata * 0.37)) * 0.5);
        rock = mix(rock, rock * imgPalette(0.05 + hueP * 0.159) * 1.6, 0.08);
        rock *= 0.85 + 0.15 * noise2(P.xz * 1.5 + P.y);
        // Soft shadow toward the sun.
        float sh = 1.0, st = 1.5;
        for (int k = 0; k < 24; ++k) {
            vec3 S = P + n * 0.6 + sunDir * st;
            float hs = S.y - terrain(S.xz);
            sh = min(sh, 4.0 * hs / st);
            st += max(hs * 0.5, 0.4);
            if (sh < 0.0 || st > 80.0) break;
        }
        sh = clamp(sh, 0.0, 1.0);
        float dif = max(dot(n, sunDir), 0.0) * sh;
        vec3 amb = vec3(0.35, 0.42, 0.6) * (0.55 + 0.45 * n.y);
        col = rock * (amb * 0.6 + sunC * dif);
        // The river along the floor: green water, sky and gold on it, glitter.
        float dx = abs(P.x - path(P.z));
        if (P.y < 1.0 && dx < 5.0) {
            vec3 water = vec3(0.1, 0.3, 0.25);
            vec3 rr = reflect(rd, vec3(0.0, 1.0, 0.0));
            float fres = 0.2 + 0.8 * pow(1.0 - max(-rd.y, 0.0), 5.0);
            vec3 wcol = mix(water, mix(vec3(1.0, 0.75, 0.45), vec3(0.4, 0.55, 0.8), smoothstep(-0.05, 0.5, rr.y)), fres);
            // Round glints of the sun on the ripples.
            vec2 g = vec2(P.x * 3.0, P.z * 1.2 - T * 0.5), gi = floor(g), gf = fract(g);
            vec2 gc = 0.25 + 0.5 * vec2(hash21(gi), hash21(gi + 3.0));
            float tw = 0.5 + 0.5 * sin(T * 3.0 + hash21(gi + 7.0) * 40.0);
            float gl = smoothstep(0.15, 0.0, length(gf - gc)) * step(0.8, hash21(gi + 5.0)) * tw * smoothstep(80.0, 10.0, t);
            wcol += vec3(1.0, 0.9, 0.7) * gl * (0.4 + 1.6 * hi) * (0.3 + 0.7 * sh);
            col = mix(col, wcol, smoothstep(4.8, 3.8, dx) * smoothstep(1.0, 0.4, P.y));
        }
        // Warm haze in the depth.
        col = mix(col, vec3(0.95, 0.72, 0.48) * (0.8 + 0.3 * swell), 1.0 - exp(-t * 0.006));
    }

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
