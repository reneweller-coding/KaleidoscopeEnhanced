#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file GemInclusionFlight.frag
 * @brief GEM INCLUSION FLIGHT: gliding through the inside of an emerald -- a
 * deep green crystal world lit from behind, full of the inclusions a
 * gemologist calls its garden: fine needles of rutile crossing at angles,
 * wispy veils of liquid fingerprints, tiny three-phase cavities with
 * bubbles inside, glittering flakes of mica, and the crystal's facets
 * seen from within as bright planes where the light reflects.  Everything
 * drifts past slowly as the view floats steadily through the stone.
 *
 * Audio Reactivity:
 *   audioSwell  -> the light through the stone (slow)
 *   audioHigh   -> the glitter of the flakes (light)
 *   audioBass   -> the glow of the facet planes (light)
 *   audioLevel  -> brightness
 *   sceneTime / sceneAdvance -> the float through the stone (constant speed)
 *
 * Per-activation variety: gardenP (how dense the garden), hueP.
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
uniform float audioHigh;   ///< High band level, 0..1.
uniform float audioBass;   ///< Bass band level, 0..1.
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float gardenP;
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
/// @brief Pseudo-random 2D vector (each 0..1) from a 2D point.
vec2 hash22(vec2 p)
{
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
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

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float bass = clamp(audioBass, 0.0, 1.0);
    float T = sceneTime + sceneAdvance * 0.4;
    float px = 1.0 / resolution.y;
    float dens = 0.4 + 0.5 * clamp(gardenP, 0.0, 1.0);

    // The stone's body: deep green, brighter toward the light behind.
    vec3 green = mix(vec3(0.0, 0.18, 0.08), vec3(0.15, 0.7, 0.35), 0.4 + 0.3 * swell);
    green = mix(green, green * imgPalette(0.35 + hueP * 0.159) * 1.3, 0.08);
    vec3 col = green * (0.35 + 0.65 * exp(-dot(p - vec2(0.1, 0.15), p - vec2(0.1, 0.15)) * 1.5));

    // Layers of inclusions at several depths, far to near, drifting past.
    for (int L = 3; L >= 0; --L) {
        float fl = float(L);
        float z = 1.0 + fl * 0.8;                              // depth
        float sc = 1.0 / z;
        vec2 q = p / sc + vec2(T * 0.08 / sc * 0.3, T * 0.02) + fl * 17.0;
        float fade = exp(-fl * 0.45);
        // Rutile needles: fine straight lines at a few crystal angles.
        vec2 ni = floor(q * 1.2);
        for (int j = -1; j <= 1; ++j)
        for (int i = -1; i <= 1; ++i) {
            vec2 id = ni + vec2(i, j);
            if (hash21(id + fl * 3.0) > dens * 0.7) continue;
            vec2 c = (id + hash22(id)) / 1.2;
            float ang = floor(hash21(id + 5.0) * 3.0) * 1.0472 + 0.3;
            vec2 dir = vec2(cos(ang), sin(ang));
            vec2 r = q - c;
            float al = dot(r, dir), ac = abs(dot(r, vec2(-dir.y, dir.x)));
            float len = 0.4 + 0.5 * hash21(id + 7.0);
            float w = 0.006 + px / sc;
            float needle = smoothstep(w, 0.0, ac) * smoothstep(len, len * 0.8, abs(al));
            col += vec3(0.9, 0.85, 0.55) * needle * 0.5 * fade;
        }
        // Fingerprint veils: curving wisps of fine parallel lines.
        float veil = smoothstep(0.55, 0.75, fbm(q * 0.6 + 3.0));
        float fp = 0.5 + 0.5 * sin(fbm(q * 0.8) * 60.0);
        col += vec3(0.75, 0.95, 0.85) * veil * (0.4 + 0.6 * fp) * 0.16 * fade * dens;
        // Milky clouds of tiny inclusions (the 'jardin').
        col += vec3(0.6, 0.85, 0.7) * smoothstep(0.5, 0.8, fbm(q * 0.35 + 9.0)) * 0.08 * fade;
        // Three-phase cavities: small elongated pockets with a bubble.
        vec2 ci = floor(q * 2.0), cf = fract(q * 2.0);
        if (hash21(ci + fl * 9.0) < dens * 0.1) {
            vec2 cc = 0.3 + 0.4 * hash22(ci);
            float ca = hash21(ci + 2.0) * 3.14159;
            vec2 d = cf - cc;
            d = vec2(dot(d, vec2(cos(ca), sin(ca))), dot(d, vec2(-sin(ca), cos(ca)))) * vec2(1.0, 2.6);
            float cav = length(d) - 0.1 - 0.03 * sin(atan(d.y, d.x) * 3.0 + ca * 5.0);
            float rim = smoothstep(0.025, 0.0, abs(cav));
            float bub = smoothstep(0.022, 0.012, length(d - vec2(0.04, 0.0)));
            col += vec3(0.9, 1.0, 0.95) * (rim * 0.3 + bub * 0.6 + smoothstep(0.0, -0.05, cav) * 0.06) * fade;
        }
        // Mica flakes glittering: round points, winking.
        vec2 gi = floor(q * 6.0), gf = fract(q * 6.0);
        vec2 gc = 0.25 + 0.5 * hash22(gi + 11.0);
        float tw = pow(0.5 + 0.5 * sin(T * 2.0 + hash21(gi + 3.0) * 40.0), 6.0);
        col += vec3(1.0, 0.98, 0.85) * smoothstep(0.1, 0.0, length(gf - gc)) * step(1.0 - 0.12 * dens, hash21(gi + 5.0)) * tw * (0.3 + 1.2 * hi) * fade;
    }
    // Facet planes seen from inside: bright bands where the light reflects,
    // at the crystal's angles, sliding slowly.
    for (int k = 0; k < 3; ++k) {
        float fk = float(k);
        float ang = 0.4 + fk * 1.0472;
        vec2 n = vec2(cos(ang), sin(ang));
        float d = dot(p, n) - 0.35 * sin(T * 0.02 + fk * 2.0);
        col += mix(vec3(0.6, 1.0, 0.7), vec3(1.0), 0.3) * exp(-abs(d) * 40.0) * 0.25 * (0.5 + 0.8 * bass);
        col += green * 0.3 * smoothstep(0.0, 0.3, d) * 0.3;
    }

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
