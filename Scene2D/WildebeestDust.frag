#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file WildebeestDust.frag
 * @brief WILDEBEEST DUST: the great migration crossing the savanna in the
 * late afternoon -- a herd of wildebeest walking in a long file and in
 * loose ranks through the dust they raise, the low sun straight ahead
 * turning the dust into glowing gold haze, the animals black silhouettes
 * with their humped shoulders, bearded heads and curved horns, legs
 * swinging in step, the far ranks dissolving in the glare.  A flat-topped
 * acacia stands against the sun.  The herd walks on steadily; the camera
 * is still.
 *
 * Audio Reactivity:
 *   audioSwell  -> the glow of the dust (slow)
 *   audioBass   -> the sun's blaze (light)
 *   audioLevel  -> brightness
 *   sceneTime / sceneAdvance -> the herd walking, the dust drifting
 *
 * Per-activation variety: herdP (how dense the herd), hueP.
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

uniform float herdP;
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
/// @brief Distance from a point to a line segment.
float sdSeg(vec2 p, vec2 a, vec2 b)
{
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h);
}

/// A wildebeest walking to the right, unit height ~1 (shoulder), feet at y=0.
float gnu(vec2 q, float ph)
{
    float d = length((q - vec2(0.02, 0.62)) * vec2(0.8, 1.35)) - 0.3;                 // barrel
    d = min(d, length((q - vec2(0.28, 0.76)) * vec2(1.1, 1.0)) - 0.24);              // hump at the shoulders
    d = min(d, length((q - vec2(-0.22, 0.62)) * vec2(1.2, 1.2)) - 0.18);             // hindquarters
    d = min(d, sdSeg(q, vec2(0.42, 0.78), vec2(0.6, 0.52)) - 0.1);                   // neck, head carried low
    d = min(d, sdSeg(q, vec2(0.6, 0.52), vec2(0.68, 0.36)) - 0.07);                 // long face
    d = min(d, sdSeg(q, vec2(0.55, 0.48), vec2(0.52, 0.3)) - 0.035);                // beard
    d = min(d, sdSeg(q, vec2(0.58, 0.6), vec2(0.5, 0.68)) - 0.022);                 // horns, curving up
    d = min(d, sdSeg(q, vec2(0.5, 0.68), vec2(0.56, 0.74)) - 0.016);
    d = min(d, sdSeg(q, vec2(-0.36, 0.66), vec2(-0.44, 0.4)) - 0.022);              // tail
    // Legs swinging in a walk: front and hind pairs out of phase.
    for (int i = 0; i < 4; ++i) {
        float fi = float(i);
        float hx = (i < 2) ? 0.26 : -0.2;
        float sw = sin(ph + fi * 1.57 + (i < 2 ? 0.0 : 3.14159)) * 0.1;
        vec2 top = vec2(hx + 0.04 * (fi - 1.5), 0.48);
        vec2 knee = vec2(hx + sw * 0.5, 0.22);
        vec2 foot = vec2(hx + sw, 0.0);
        d = min(d, sdSeg(q, top, knee) - 0.045);
        d = min(d, sdSeg(q, knee, foot) - 0.025);
    }
    return d;
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float bass = clamp(audioBass, 0.0, 1.0);
    float T = sceneTime + sceneAdvance * 0.4;
    float px = 1.0 / resolution.y;
    float dens = 0.45 + 0.5 * clamp(herdP, 0.0, 1.0);

    float hz = -0.05;
    vec2 sun = vec2(0.12, hz + 0.1);
    float sd = length(p - sun);
    // The sky and the dust: gold everywhere, blinding round the sun.
    vec3 dust = mix(vec3(0.95, 0.6, 0.25), vec3(0.8, 0.45, 0.25), smoothstep(hz, 0.5, p.y));
    dust = mix(dust, dust * imgPalette(0.08 + hueP * 0.159) * 1.3, 0.08);
    vec3 col = dust * (0.75 + 0.35 * swell);
    col += vec3(1.0, 0.85, 0.55) * exp(-sd * 4.0) * (0.6 + 0.4 * bass) + vec3(1.0, 0.95, 0.8) * smoothstep(0.045, 0.035, sd) * 1.5;
    // Dust clouds drifting, thicker low down.
    float dc = fbm(vec2(p.x * 3.0 - T * 0.03, p.y * 5.0));
    col += vec3(1.0, 0.7, 0.35) * dc * 0.25 * smoothstep(0.3, hz - 0.05, p.y) * (0.6 + 0.6 * swell);

    // The acacia against the sun.
    {
        vec2 aq = p - vec2(-0.4, hz);
        float trunk = sdSeg(aq, vec2(0.0, 0.0), vec2(0.01, 0.1)) - 0.006;
        trunk = min(trunk, sdSeg(aq, vec2(0.01, 0.1), vec2(-0.08, 0.17)) - 0.004);
        trunk = min(trunk, sdSeg(aq, vec2(0.01, 0.1), vec2(0.1, 0.165)) - 0.004);
        trunk = min(trunk, sdSeg(aq, vec2(0.01, 0.1), vec2(0.02, 0.17)) - 0.004);
        float crown = max(abs(aq.y - 0.185 - 0.006 * noise2(vec2(aq.x * 25.0, 3.0))) - 0.014 - 0.01 * noise2(vec2(aq.x * 40.0, 1.0)), abs(aq.x - 0.02) - 0.17);
        crown = max(crown, length((aq - vec2(0.02, 0.1)) * vec2(0.55, 1.0)) - 0.12);
        float a = min(trunk, crown);
        col = mix(col, vec3(0.2, 0.1, 0.05), smoothstep(px, -px, a) * 0.85);
    }
    // The ground: pale grass in the glare.
    if (p.y < hz) {
        col = mix(col, vec3(0.6, 0.42, 0.22) * (0.7 + 0.3 * noise2(p * vec2(30.0, 90.0))), smoothstep(hz, hz - 0.3, p.y) * 0.6);
    }

    // The herd in ranks: far ranks small and pale in the dust, near ones dark.
    for (int r = 0; r < 4; ++r) {
        float fr = float(r);
        float sc = 0.03 * pow(1.0 + fr * 0.75, 1.7);             // animal height on screen
        float gy = hz - 0.01 - 0.04 * fr * (1.0 + fr * 0.35);   // where the rank's feet are
        float speed = 0.02 * (0.5 + 0.5 * fr);
        float spacing = sc * 1.9;
        float x = (p.x + T * speed * (0.8 + 0.2 * hash11(fr))) / spacing + fr * 7.3;
        float ci = floor(x);
        float best = 1e9;
        for (int k = -1; k <= 1; ++k) {
            float id = ci + float(k);
            if (hash11(id * 1.37 + fr * 11.0) > dens) continue;
            float ox = (id + 0.5 + 0.3 * (hash11(id * 2.7 + fr) - 0.5)) * spacing - T * speed * (0.8 + 0.2 * hash11(fr)) - fr * 7.3 * spacing;
            float oy = gy - 0.006 * sc / 0.035 * hash11(id * 3.3 + fr);
            float s = sc * (0.85 + 0.3 * hash11(id * 4.1 + fr));
            float ph = T * 3.5 + hash11(id * 5.9 + fr) * 6.28;
            best = min(best, gnu((p - vec2(ox, oy)) / s, ph) * s);
        }
        float cov = smoothstep(px, -px, best);
        // Far ranks sink into the golden dust; near ranks are black with a rim.
        vec3 fig = mix(vec3(0.05, 0.03, 0.02), col * 0.7, exp(-fr * 1.2) * 0.7);
        col = mix(col, fig, cov);
        col += vec3(1.0, 0.7, 0.35) * smoothstep(0.004, 0.0, abs(best)) * step(best, 0.002) * 0.25 * fr / 3.0;
        // Dust kicked up at the feet of each rank.
        col += vec3(1.0, 0.7, 0.4) * fbm(vec2(p.x * 12.0 / (1.0 + fr) - T * speed * 10.0, p.y * 30.0)) * exp(-abs(p.y - gy) / (0.02 + 0.02 * fr)) * 0.15 * (0.6 + 0.6 * swell);
    }

    // Dust hanging in front of everything low down.
    col = mix(col, vec3(1.0, 0.68, 0.35) * (0.8 + 0.3 * swell), smoothstep(0.45, 0.8, fbm(vec2(p.x * 2.5 - T * 0.05, p.y * 4.0) + 9.0)) * smoothstep(0.0, -0.35, p.y) * 0.45);

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
