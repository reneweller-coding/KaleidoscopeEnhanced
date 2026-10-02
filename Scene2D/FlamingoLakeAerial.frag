#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file FlamingoLakeAerial.frag
 * @brief FLAMINGO LAKE AERIAL: an East African soda lake seen from high above
 * -- water stained blood red and orange by algae, rimmed and veined with
 * white salt crust, and on it tens of thousands of flamingos: pink specks
 * packed into flowing bands and swirls along the shallows, each bird a
 * tiny pink body with its shadow; here and there a group takes off, wings
 * open showing the black flight feathers.  The flocks drift slowly as the
 * birds wade; the camera hangs still.
 *
 * Audio Reactivity:
 *   audioSwell  -> the glow of the red water (slow)
 *   audioHigh   -> the shimmer on the water (light)
 *   audioLevel  -> brightness
 *   sceneTime / sceneAdvance -> the flocks drifting, birds wading
 *
 * Per-activation variety: flockP (how dense the flocks), hueP.
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
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float flockP;
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
    for (int i = 0; i < 5; ++i) { v += a * noise2(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 2.3; a *= 0.5; }
    return v;
}

/// Where the flocks stand: flowing bands along the shallows.
float flockField(vec2 p, float T)
{
    vec2 q = p + 0.08 * vec2(sin(p.y * 3.0 + T * 0.01), cos(p.x * 2.5 - T * 0.012));
    float bands = 0.5 + 0.5 * sin(q.x * 5.0 + q.y * 9.0 + 2.0 * fbm(q * 1.5));
    return smoothstep(0.55, 0.85, bands) * smoothstep(0.35, 0.6, fbm(q * 2.0 + 3.0));
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float T = sceneTime + sceneAdvance * 0.4;
    float dens = 0.6 + 0.4 * clamp(flockP, 0.0, 1.0);
    float px = 1.0 / resolution.y;

    // The lake: red and orange algae water, white salt crust in veins and rims.
    float alg = fbm(p * 2.5 + 11.0);
    vec3 water = mix(vec3(0.35, 0.06, 0.05), vec3(0.75, 0.28, 0.1), smoothstep(0.3, 0.75, alg));
    water = mix(water, vec3(0.45, 0.12, 0.2), smoothstep(0.65, 0.85, fbm(p * 5.0)) * 0.5);
    water = mix(water, water * imgPalette(0.02 + hueP * 0.159) * 1.4, 0.1);
    water *= 0.8 + 0.35 * swell;
    // The salt crust lines the shore at the lower left and runs out in veins.
    float shore = dot(p, normalize(vec2(-0.6, -1.0))) - 0.28 + 0.12 * (fbm(p * 2.0 + 5.0) - 0.5);
    float salt = smoothstep(0.0, 0.02, shore);
    float saltVein = smoothstep(0.02, 0.0, abs(fbm(p * 4.0 + 20.0) - 0.5)) * 0.7 * smoothstep(-0.25, 0.0, shore);
    // Salt crust: bright, cracked into plates, a faint pink tinge near the water.
    float plates = smoothstep(0.015, 0.0, abs(fbm(p * 14.0) - 0.5)) + 0.6 * smoothstep(0.01, 0.0, abs(fbm(p * 30.0 + 3.0) - 0.5));
    vec3 saltC = mix(vec3(1.0, 0.98, 0.95), vec3(1.0, 0.85, 0.8), smoothstep(0.08, 0.0, shore)) * 1.15 * (1.0 - 0.18 * clamp(plates, 0.0, 1.0)) * (0.94 + 0.06 * noise2(p * 200.0));
    vec3 col = mix(water, saltC, max(salt, saltVein));
    // Shimmer of the sun on the water.
    {
        vec2 gg = p * 90.0, gi2 = floor(gg), gf2 = fract(gg);
        vec2 gc = 0.25 + 0.5 * hash22(gi2);
        float tw = pow(0.5 + 0.5 * sin(T * 2.0 + hash21(gi2 + 7.0) * 40.0), 3.0);
        col += vec3(1.0, 0.85, 0.75) * smoothstep(0.12, 0.0, length(gf2 - gc)) * step(0.93, hash21(gi2 + 5.0)) * tw * (0.15 + 0.8 * hi) * (1.0 - salt);
    }

    // The flamingos: pink bodies on a jittered lattice, dense inside the flocks.
    float cell = 0.02;
    vec2 g = p / cell;
    vec2 gi = floor(g);
    for (int j = -1; j <= 1; ++j)
    for (int i = -1; i <= 1; ++i) {
        vec2 id = gi + vec2(i, j);
        vec2 ctr = (id + 0.5) * cell;
        float ff = flockField(ctr, T);
        if (hash21(id + 3.0) > ff * dens * 1.3 || flockField(ctr, T) < 0.01) continue;
        if (dot(ctr, normalize(vec2(-0.6, -1.0))) - 0.28 > 0.0) continue;         // not on the salt
        // Each bird wades slowly about its place.
        vec2 jig = 0.3 * vec2(sin(T * 0.1 + hash21(id) * 30.0), cos(T * 0.08 + hash21(id + 1.0) * 30.0));
        vec2 c = (id + 0.2 + 0.6 * hash22(id) + jig * 0.3) * cell;
        float ang = hash21(id + 5.0) * 6.2831853;
        vec2 dir = vec2(cos(ang), sin(ang));
        vec2 q = p - c;
        vec2 bq = vec2(dot(q, dir), dot(q, vec2(-dir.y, dir.x)));
        // Flying birds: a few, wings spread, black trailing edges.
        bool flying = hash21(id + 9.0) > 0.97;
        float sc = cell * (flying ? 0.6 : 0.36);
        vec2 u = bq / sc;
        // Shadow of the bird, offset toward the lower right.
        vec2 sq = (p - c - vec2(0.004, -0.004) * (flying ? 3.0 : 1.0));
        vec2 su = vec2(dot(sq, dir), dot(sq, vec2(-dir.y, dir.x))) / sc;
        float body = length(u * vec2(0.8, 1.5)) - 0.55;
        float sbody = length(su * vec2(0.8, 1.5)) - 0.55;
        float neck = length(vec2(u.x - 0.75, u.y - 0.1 * sin(u.x * 3.0))) - 0.18;
        float d = min(body, neck);
        float sd = min(sbody, length(vec2(su.x - 0.75, su.y)) - 0.18);
        float wing = 1e9;
        if (flying) {
            wing = max(abs(u.x + 0.05) - 0.22, abs(u.y) - 1.4 - 0.05 * sin(T * 3.0 + hash21(id) * 10.0));
            d = min(d, wing);
            sd = min(sd, max(abs(su.x + 0.05) - 0.22, abs(su.y) - 1.4));
        }
        float aa = px / sc * 1.2;
        col *= 1.0 - 0.35 * smoothstep(aa, -aa, sd);
        float cov = smoothstep(aa, -aa, d);
        vec3 pink = mix(vec3(1.0, 0.6, 0.68), vec3(1.0, 0.82, 0.85), hash21(id + 7.0)) * 1.15;
        if (flying) pink = mix(pink, vec3(0.05), smoothstep(-0.05, 0.1, u.x + 0.18) * step(0.5, abs(u.y)) * step(wing, 0.0));
        col = mix(col, pink * 1.1, cov);
    }

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
