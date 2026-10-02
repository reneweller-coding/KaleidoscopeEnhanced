#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file FogBridgeTowers.frag
 * @brief FOG BRIDGE TOWERS: early morning above a bay filled with fog -- a
 * smooth white sea of cloud lying in the strait, and rising out of it the
 * two towers of a great suspension bridge, red-orange steel lit by the
 * low sun, the main cables sweeping in catenaries between them and down
 * into the fog, the thin suspender ropes hanging in rows.  Hills stand
 * dark on either side, the far shore's hills floating above the fog.
 * The fog rolls slowly in waves through the strait; the camera is still.
 *
 * Audio Reactivity:
 *   audioSwell  -> the warmth of the sunrise light (slow)
 *   audioBass   -> the glow of the fog where the sun strikes it (light)
 *   audioLevel  -> brightness
 *   sceneTime / sceneAdvance -> the fog rolling (continuous)
 *
 * Per-activation variety: fogP (how high the fog lies), hueP.
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

uniform float fogP;
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
/// @brief Fractal noise: octaves of value noise.
float fbm(vec2 p)
{
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; ++i) { v += a * noise2(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 2.3; a *= 0.5; }
    return v;
}
/// @brief Signed distance to a box of half size b.
float sdBox(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }

/// A bridge tower: two legs joined by stepped portal struts, tapering upward.
float tower(vec2 q, float h, float w)
{
    float y = q.y / h;
    float legW = w * (0.16 - 0.04 * y);
    float legX = w * (0.5 - 0.08 * y);
    float legs = min(sdBox(q - vec2(-legX, h * 0.5), vec2(legW, h * 0.5)), sdBox(q - vec2(legX, h * 0.5), vec2(legW, h * 0.5)));
    float d = legs;
    for (int i = 0; i < 4; ++i) {
        float fy = 0.3 + 0.22 * float(i);
        d = min(d, sdBox(q - vec2(0.0, h * fy), vec2(legX, h * 0.022)));
    }
    d = min(d, sdBox(q - vec2(0.0, h * 0.985), vec2(legX + legW, h * 0.018)));
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

    // Sky: pale gold at the horizon, blue above; the sun low at the right.
    vec2 sun = vec2(0.62, 0.0);
    float sd = length(p - sun);
    vec3 col = mix(vec3(1.0, 0.82, 0.6), vec3(0.45, 0.62, 0.85), smoothstep(-0.05, 0.45, p.y));
    col += vec3(1.0, 0.75, 0.45) * exp(-sd * 3.0) * (0.4 + 0.4 * swell) + vec3(1.0, 0.95, 0.8) * smoothstep(0.03, 0.02, sd);
    vec3 sunLight = mix(vec3(1.0, 0.72, 0.45), vec3(1.0, 0.85, 0.65), 0.5) * (0.85 + 0.35 * swell);

    // Far hills floating above the fog, hazy.
    float farH = -0.02 + 0.06 * fbm(vec2(p.x * 2.0 + 3.0, 1.0));
    col = mix(col, mix(vec3(0.45, 0.45, 0.55), col, 0.45), step(p.y, farH));

    // The fog's top surface: soft rolling billows.
    float fogTop = -0.12 + 0.12 * clamp(fogP, 0.0, 1.0) + 0.018 * fbm(vec2(p.x * 4.0 - T * 0.02, 2.0)) + 0.01 * sin(p.x * 6.0 - T * 0.05);

    // The bridge: two towers, main cables, suspenders; drawn before the fog.
    vec2 t1 = vec2(-0.3, fogTop - 0.2), t2 = vec2(0.28, fogTop - 0.2);
    float h1 = 0.62, h2 = 0.52;
    float br = min(tower(p - t1, h1, 0.07), tower(p - t2, h2, 0.058));
    // Main cable between the tower tops (a catenary sagging to the fog) and
    // the side spans running down out of frame.
    vec2 a = t1 + vec2(0.0, h1), b = t2 + vec2(0.0, h2);
    float cx = (p.x - a.x) / (b.x - a.x);
    float sag = 0.36;
    float cy = mix(a.y, b.y, cx) - sag * 4.0 * cx * (1.0 - cx);
    float cable = (cx > 0.0 && cx < 1.0) ? abs(p.y - cy) - 0.003 : 1e9;
    // Side spans.
    float sideL = (p.x < a.x) ? abs(p.y - (a.y - (a.x - p.x) * 0.9 - 0.8 * pow(a.x - p.x, 2.0))) - 0.003 : 1e9;
    float sideR = (p.x > b.x) ? abs(p.y - (b.y - (p.x - b.x) * 0.8 - 0.7 * pow(p.x - b.x, 2.0))) - 0.003 : 1e9;
    cable = min(cable, min(sideL, sideR));
    // Suspenders: vertical lines from the cable down into the fog.
    float susp = 1e9;
    if (cx > 0.02 && cx < 0.98 && p.y < cy) {
        float sx = fract(p.x * 70.0) - 0.5;
        susp = abs(sx) / 70.0 - 0.0006;
    }
    float bridge = min(br, min(cable, susp));
    float bcov = smoothstep(px, -px, bridge);
    // International orange, lit by the sun on the right faces.
    vec3 steel = vec3(0.75, 0.2, 0.08);
    steel = mix(steel, steel * imgPalette(0.04 + hueP * 0.159) * 1.4, 0.08);
    float litSide = smoothstep(-0.002, 0.004, br + 0.0) * 0.0 + 0.5 + 0.5 * smoothstep(-0.01, 0.01, sin((p.x - t1.x) * 90.0));
    vec3 bc = steel * (0.35 + 0.8 * sunLight * (0.6 + 0.4 * litSide));
    col = mix(col, bc, bcov);

    // A dark headland on the left, sloping down into the fog.
    float hillY = fogTop - 0.1 + 0.55 * smoothstep(-0.3, -0.95, p.x) + 0.02 * fbm(vec2(p.x * 8.0, 5.0));
    col = mix(col, vec3(0.1, 0.12, 0.1) + sunLight * 0.04, smoothstep(px, -px, p.y - hillY));
    // The fog: bright on top where the sun strikes it, shaded in the troughs,
    // its billows foreshortened as the sea of cloud recedes.
    if (p.y < fogTop + 0.02) {
        float dy = fogTop - p.y;
        float z = 0.25 / (dy + 0.02);
        vec2 fq = vec2(p.x * z * 3.0 - T * 0.03, z * 2.0 + T * 0.01);
        float bill = fbm(fq);
        // Billows lit from the sun's side, shaded on the far side.
        float sh = clamp((bill - fbm(fq + vec2(0.15, 0.05))) * 6.0 + 0.5, 0.0, 1.0);
        vec3 fogC = mix(vec3(0.66, 0.7, 0.84), vec3(1.0, 0.93, 0.85) * (0.9 + 0.4 * bass), smoothstep(0.3, 0.7, bill) * 0.5 + sh * 0.5);
        fogC = mix(fogC, vec3(0.92, 0.88, 0.86), smoothstep(0.5, 0.05, dy) * 0.4);          // the far fog is an even glow
        fogC += sunLight * 0.25 * exp(-length((p - vec2(sun.x, fogTop)) * vec2(0.8, 3.0)) * 3.0) * (0.6 + 0.6 * bass);
        float edge = smoothstep(-0.015, 0.01, dy + 0.012 * (bill - 0.5));
        col = mix(col, fogC, edge);
    }
    // Wisps of fog drifting through the towers above the deck.
    float wisp = smoothstep(0.55, 0.8, fbm(vec2(p.x * 3.0 - T * 0.03, p.y * 12.0))) * smoothstep(fogTop + 0.15, fogTop, p.y) * step(fogTop, p.y);
    col = mix(col, vec3(0.95, 0.93, 0.95), wisp * 0.4);
    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
