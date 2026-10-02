#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file MirrorBallRoom.frag
 * @brief MIRROR BALL ROOM: an empty ballroom at night with a mirror ball
 * turning under the ceiling.  A spotlight hits the ball and a thousand
 * small squares of light wander steadily over the walls, the parquet and
 * the columns; in the haze each reflection draws a thin beam back to the
 * ball.  The ball keeps its own slow speed -- the music is in the light:
 * the spot brightens with the kick, and the reflections take their colour
 * from the band of the facet they come from.
 *
 * Audio Reactivity:
 *   audioKick         -> the spotlight on the ball (light)
 *   audioSpectrum[32] -> brightness of each reflection, by facet band
 *   audioSwell        -> haze in the room, so more beams show (slow)
 *   sceneTime         -> the ball's rotation (continuous, constant)
 *
 * Per-activation variety: tintP (white or coloured light), hueP.
 */
uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float sceneAdvance;   ///< The music's advance since this scene was activated (integrated, never jumps).
uniform float sceneTime;   ///< Seconds since this scene was activated.
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioSpectrum[32];   ///< Spectrum bands, 0..1.
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.

uniform float tintP;   ///< Tint knob, 0..1.
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
    vec3  col = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float g   = dot(col, vec3(0.333));
    return mix(vec3(g), col, 0.55 + 0.45 * audioValence);
}

/// @brief Pseudo-random number 0..1 from a 2D point.
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
/// @brief Pseudo-random 2D vector (each 0..1) from a 2D point.
vec2  hash22(vec2 p) { return vec2(hash21(p), hash21(p + 17.3)); }

const vec3 BALL = vec3(0.0, 3.2, 6.0);
const float BR = 0.45;
float g_rot, g_hue, g_tint;

/// The pattern of reflections on a surface point: the ball throws its
/// facet reflections in all directions; seen from BALL, the direction to
/// the point picks a facet cell on a rotating sphere grid.  Each lit facet
/// is a small soft square spot.
vec3 spots(vec3 p)
{
    vec3 d = normalize(p - BALL);
    // Rotate the grid about the vertical axis.
    float ca = cos(g_rot), sa = sin(g_rot);
    d = vec3(ca * d.x + sa * d.z, d.y, -sa * d.x + ca * d.z);
    float lat = asin(clamp(d.y, -1.0, 1.0));
    float lon = atan(d.z, d.x);
    float nLat = 26.0;
    float li = floor((lat / 3.14159 + 0.5) * nLat);
    float ringN = max(4.0, floor(2.0 * nLat * cos((li + 0.5) / nLat * 3.14159 - 1.5708)));
    float lo = (lon / 6.2831853 + 0.5) * ringN;
    vec2 cell = vec2(floor(lo), li);
    vec2 f = vec2(fract(lo), fract((lat / 3.14159 + 0.5) * nLat)) - 0.5;
    // Not every facet catches the spotlight.
    float on = step(0.55, hash21(cell));
    float sz = 0.22;
    float sq = smoothstep(sz, sz - 0.07, length(f * vec2(1.0, 1.15)));
    int band = int(mod(hash21(cell + 3.0) * 32.0, 32.0));
    float e = clamp(audioSpectrum[band] * 1.5, 0.0, 1.0);
    vec3 c = mix(vec3(1.0), imgPalette(g_hue * 0.159 + hash21(cell + 9.0) * 0.8) * 1.4, g_tint);
    float dist = length(p - BALL);
    return c * sq * on * (0.4 + 1.0 * e) * 11.0 / (1.0 + dist * dist * 0.08);
}

/// The room: floor y=0, walls at x=+-6, back wall z=16, columns.
float mapRoom(vec3 p)
{
    float d = min(p.y, 6.0 - p.y);
    d = min(d, 6.0 - abs(p.x));
    d = min(d, 16.0 - p.z);
    vec2 q = vec2(abs(p.x) - 4.2, mod(p.z, 4.0) - 2.0);
    d = min(d, length(q) - 0.28);
    return d;
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    g_hue = (hueP > 0.001) ? hueP : 0.0;
    g_tint = clamp(tintP, 0.0, 1.0) * 0.8;
    g_rot = sceneTime * 0.16;
    float swell = clamp(audioSwell, 0.0, 1.0);
    float kick = clamp(audioKick, 0.0, 2.0);
    float spot = 1.0 + 0.4 * kick;

    vec3 ro = vec3(0.0, 1.7, -3.0);
    vec3 rd = normalize(vec3(p.x, p.y + 0.15, 1.2));

    // March to the room surfaces.
    float t = 0.0;
    for (int i = 0; i < 80; ++i)
    {
        float d = mapRoom(ro + rd * t);
        if (d < 0.002) break;
        t += d;
        if (t > 40.0) break;
    }
    vec3 hp = ro + rd * t;
    vec3 base;
    if (hp.y < 0.01)
    {
        // Parquet: herringbone of the photo's wood tones.
        vec2 q = hp.xz * 2.0;
        vec2 bi = floor(vec2(q.x + q.y, q.x - q.y));
        base = img(fract(bi * 0.071)) * 0.35 + vec3(0.12, 0.07, 0.04);
        base *= 0.8 + 0.3 * hash21(bi);
    }
    else if (hp.y > 5.99) base = vec3(0.05, 0.04, 0.05);
    else
    {
        vec3 wall = mix(vec3(0.35, 0.16, 0.2), imgPalette(g_hue * 0.159 + 0.6) * 0.5, 0.4);
        float panel = smoothstep(0.02, 0.0, abs(fract(hp.z * 0.5 + hp.x * 0.5) - 0.5) - 0.47);
        base = wall * (0.8 + 0.3 * panel);
    }
    // Light spots are the light itself; the surface only tints them a little.
    vec3 col = base * 0.18 + (0.45 + base) * spots(hp) * spot * 0.6;

    // The ball itself: facets of mirror, some flashing.
    vec3 oc = ro - BALL;
    float b = dot(oc, rd), c = dot(oc, oc) - BR * BR, h = b * b - c;
    float tb = (h > 0.0) ? -b - sqrt(h) : 1e9;
    if (tb > 0.0 && tb < t)
    {
        vec3 n = normalize(ro + rd * tb - BALL);
        float ca = cos(g_rot), sa = sin(g_rot);
        vec3 nr = vec3(ca * n.x + sa * n.z, n.y, -sa * n.x + ca * n.z);
        vec2 fc = floor(vec2(atan(nr.z, nr.x) * 8.0, asin(nr.y) * 10.0));
        float flash = pow(hash21(fc + floor(sceneTime * 3.0)), 12.0);
        vec3 mir = vec3(0.35) + vec3(1.2) * flash * spot;
        mir *= 0.6 + 0.4 * hash21(fc);
        col = mir;
        t = tb;
    }
    // The chain up to the ceiling.
    float chain = smoothstep(0.02, 0.0, abs(p.x - 0.0)) * step(0.33, p.y);
    col = mix(col, vec3(0.15), chain * 0.5);

    // Beams in the haze: march a few samples, each asks the ball pattern
    // whether a reflection passes through it (a beam from the ball).
    vec3 beams = vec3(0.0);
    float haze = 0.35 + 0.65 * swell;
    const int N = 40;
    float dt = min(t, 22.0) / float(N);
    float jit = hash21(gl_FragCoord.xy) * dt;
    for (int i = 0; i < N; ++i)
    {
        vec3 x = ro + rd * (jit + dt * float(i));
        vec3 sp = spots(x);
        beams += sp * 0.045 * dt;
    }
    col += beams * haze * spot;
    // The spotlight's own beam onto the ball, from high left.
    vec3 sl = vec3(-5.0, 5.8, -1.0);
    vec3 ax = normalize(BALL - sl);
    vec3 w = ro + rd * max(dot(BALL - ro, rd), 0.0);
    float along = dot(w - sl, ax);
    float across = length((w - sl) - ax * along);
    col += vec3(1.0, 0.95, 0.85) * exp(-across * across * 12.0) * step(0.0, along) * 0.04 * haze * spot;

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
