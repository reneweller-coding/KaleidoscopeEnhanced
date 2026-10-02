#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file GasGiantAtmosphere.frag
 * @brief GAS GIANT ATMOSPHERE: cruising low over the cloud deck of a gas
 * giant.  Billowing tops in the planet's own zone-and-belt colours (cream,
 * ochre, rust) run to a warm hazy horizon; convective towers rise here and
 * there, lit by a low sun with long shadows.  Above, the planet's rings arch
 * across a blue-violet sky beside a crescent moon.  Storm cells deep in the
 * deck light up from inside with the kick.
 *   sceneTime/sceneAdvance -> the cruise (continuous, steady)
 *   audioKick    -> lightning glowing inside the storm cells (light only)
 *   audioSwell   -> sunlight and ring brightness (slow)
 *   audioChromaHue-> photo tint of haze and rings
 *
 * Per-activation variety:
 *   cloudP float density and thickness of the clouds (0.5..1.5)
 *   stormP float intensity of the lightning storms (0.5..2.0)
 *   hueP float palette offset (0..6.28)
 */

uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioPhase;   ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
// Beide zaehlen ab DIESER Aktivierung statt ab Programmstart:
// `time` und `audioAdvance` wachsen unbegrenzt und taugen daher nur
// als Phase, nicht als Position oder Rauschkoordinate.
uniform float sceneTime;   ///< Seconds since this scene was activated.
uniform float sceneAdvance;   ///< The music's advance since this scene was activated (integrated, never jumps).

uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioCentroid;   ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float cloudP;
uniform float stormP;
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

/// @brief Rotates a colour's hue by an angle (about the grey axis).
vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

/// @brief Pseudo-random number 0..1 from a float.
float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }

/// @brief Smooth value noise.
float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n = i.x + i.y * 57.0 + i.z * 113.0;
    return mix(
        mix(mix(hash11(n + 0.0), hash11(n + 1.0), f.x),
            mix(hash11(n + 57.0), hash11(n + 58.0), f.x), f.y),
        mix(mix(hash11(n + 113.0), hash11(n + 114.0), f.x),
            mix(hash11(n + 170.0), hash11(n + 171.0), f.x), f.y), f.z);
}

/// @brief Fractal noise: octaves of value noise.
float fbm(vec3 p) {
    float f = 0.0, a = 0.5;
    for(int i = 0; i < 5; i++) { f += a * noise(p); p *= 2.0; a *= 0.5; }
    return f;
}

/// @brief Pseudo-random number 0..1 from a 2D point.
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
/// @brief Smooth 2D value noise, 0..1.
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
/// @brief Fractal noise of the given number of octaves.
float fbm2(vec2 p, int oct)
{
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 6; ++i) { if (i >= oct) break; v += a * noise2(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 3.1; a *= 0.5; }
    return v;
}
/// Billows: |2n - 1| per octave -- rounded puffs with creases between them,
/// the cauliflower look of convective cloud tops.
float billow(vec2 p, int oct)
{
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 6; ++i) { if (i >= oct) break; v += a * abs(2.0 * noise2(p) - 1.0); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 3.1; a *= 0.5; }
    return v;
}

/// The cloud deck: billowing tops, with tall convective towers here and
/// there.  Heights in km-ish units; the camera cruises at 9.
float deck(vec2 xz, int oct)
{
    float b = billow(xz * 0.07, oct) * 5.0 + fbm2(xz * 0.015, 2) * 3.0;
    float tower = smoothstep(0.62, 0.9, noise2(xz * 0.012 + 7.0));
    b += tower * (6.0 + 3.0 * fbm2(xz * 0.15, 2)) * smoothstep(0.3, 0.7, noise2(xz * 0.05));
    return b;
}

/// Zones and belts: the gas giant's own colours (cream, ochre, rust, white),
/// in bands across the flight, warped into eddies.
vec3 bandCol(vec2 xz)
{
    float w = fbm2(xz * 0.01, 3);
    float u = xz.x * 0.012 + xz.y * 0.004 + w * 1.6;
    float b = 0.5 + 0.5 * sin(u * 6.2831853);
    float b2 = 0.5 + 0.5 * sin(u * 17.0 + w * 4.0);
    vec3 zone = vec3(0.96, 0.9, 0.78);
    vec3 belt = vec3(0.72, 0.42, 0.24);
    vec3 rust = vec3(0.55, 0.26, 0.16);
    vec3 c = mix(belt, zone, smoothstep(0.3, 0.7, b));
    c = mix(c, rust, smoothstep(0.6, 0.9, b2) * (1.0 - b));
    // White ovals: storms riding the zone edges.
    vec2 oc = xz * vec2(0.02, 0.012);
    vec2 oi = floor(oc), of = fract(oc) - 0.5;
    float oval = smoothstep(0.32, 0.22, length(of * vec2(1.0, 1.7))) * step(0.6, hash21(oi + 2.7));
    c = mix(c, vec3(1.0, 0.98, 0.95), oval * 0.8);
    return c;
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float cp = (cloudP > 0.01 ? cloudP : 1.0);
    float sp = (stormP > 0.01 ? stormP : 1.0);
    float hue = (hueP > 0.01 ? hueP : 0.0);
    float swell = clamp(audioSwell, 0.0, 1.0);

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    // Cruise over the deck (continuous).  The camera stays near the origin
    // in x/y; only z runs, and only for the length of this activation.
    float drift = sceneTime * 2.5 + sceneAdvance * 8.0;
    vec3 ro = vec3(6.0 * sin(sceneTime * 0.017), 12.0 + 1.5 * sin(sceneTime * 0.041), drift);
    vec3 ww = normalize(vec3(0.15 * sin(sceneTime * 0.013), -0.03, 1.0));
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.15 * ww);

    vec3 sunDir = normalize(vec3(-0.55, 0.22, 0.8));
    vec3 sunC = vec3(1.0, 0.86, 0.66) * (1.1 + 0.4 * swell);

    // Sky: warm haze at the horizon, deep blue-violet above.
    float up = max(rd.y, 0.0);
    vec3 hazeC = mix(vec3(0.95, 0.78, 0.58), imgPalette(0.1), 0.18);
    vec3 col = mix(hazeC, vec3(0.1, 0.12, 0.3), pow(up, 0.55));
    float sunA = max(dot(rd, sunDir), 0.0);
    col += sunC * (pow(sunA, 600.0) * 3.0 + pow(sunA, 12.0) * 0.35);

    // A moon in crescent.
    {
        vec3 md = normalize(vec3(0.5, 0.3, 1.0));
        float mr = acos(clamp(dot(rd, md), -1.0, 1.0));
        if (mr < 0.05) {
            vec3 mu = normalize(cross(md, vec3(0.0, 1.0, 0.0))), mv = cross(mu, md);
            vec2 mq = vec2(dot(rd, mu), dot(rd, mv)) / 0.035;
            vec3 mN = mq.x * mu + mq.y * mv - sqrt(max(1.0 - dot(mq, mq), 0.0)) * md;   // faces us
            float lit = smoothstep(-0.05, 0.3, dot(mN, sunDir));
            float disc = smoothstep(1.0, 0.95, length(mq));
            col = mix(col, vec3(0.85, 0.82, 0.78) * (0.05 + 0.95 * lit), disc);
        }
    }

    // The rings, seen from inside the atmosphere: a broad band of ringlets
    // arching across the sky from horizon to horizon (a tilted great
    // circle), cut by the planet's shadow near one end.
    {
        vec3 ax = normalize(vec3(0.144, -0.933, 0.329));
        float s = dot(rd, ax);
        float ring = smoothstep(0.03, 0.04, s) * smoothstep(0.2, 0.185, s);
        float lets = 0.62 + 0.38 * sin(s * 700.0) * (0.5 + 0.5 * sin(s * 181.0 + 1.0));
        lets *= 0.75 + 0.25 * smoothstep(0.08, 0.12, s);
        ring *= lets * (1.0 - 0.9 * smoothstep(0.128, 0.132, s) * smoothstep(0.142, 0.138, s));   // a gap
        float shadow = 1.0 - 0.75 * smoothstep(0.93, 0.97, dot(rd, normalize(vec3(0.95, 0.3, 0.1))));
        vec3 rc = mix(vec3(0.95, 0.88, 0.76), imgPalette(0.3), 0.15) * (0.75 + 0.35 * swell) * shadow;
        col = mix(col, rc, ring * 0.8 * smoothstep(0.0, 0.12, rd.y));
    }
    // March the cloud deck (height field).
    float t = 0.5;
    float hit = 0.0;
    vec3 p = ro;
    for (int i = 0; i < 90; ++i) {
        p = ro + rd * t;
        float h = deck(p.xz, 3) * cp;
        float dh = p.y - h;
        if (dh < 0.02 * t) { hit = 1.0; break; }
        t += max(dh * 0.45, 0.05 + t * 0.004);
        if (t > 260.0 || p.y > 22.0 && rd.y > 0.0) break;
    }

    if (hit > 0.5) {
        vec2 xz = p.xz;
        float e = 0.15 + t * 0.004;
        float h0 = deck(xz, 5) * cp;
        vec3 n = normalize(vec3(deck(xz - vec2(e, 0.0), 5) * cp - deck(xz + vec2(e, 0.0), 5) * cp,
                                2.0 * e,
                                deck(xz - vec2(0.0, e), 5) * cp - deck(xz + vec2(0.0, e), 5) * cp));
        vec3 alb = bandCol(xz);
        float dif = max(dot(n, sunDir), 0.0);
        // Self-shadow toward the low sun: sample the deck along the sun ray.
        float sh = 1.0;
        for (int k = 1; k < 6; ++k) {
            vec3 sp3 = vec3(xz.x, h0, xz.y) + sunDir * float(k) * 1.6;
            sh = min(sh, clamp((sp3.y - deck(sp3.xz, 3) * cp) * 0.6 + 0.2, 0.0, 1.0));
        }
        float amb = 0.35 + 0.25 * n.y;
        float heightTone = 0.75 + 0.35 * smoothstep(0.0, 8.0, h0);     // tops brighter, valleys deep
        vec3 c = alb * (sunC * dif * sh * 1.05 + vec3(0.45, 0.5, 0.65) * amb) * heightTone;
        // Silver lining where the sun grazes the tops.
        c += sunC * pow(1.0 - max(dot(n, -rd), 0.0), 4.0) * dif * 0.25;

        // Lightning deep in the deck: storm cells flash with the kick and
        // light the clouds from inside, blue-white.
        vec2 cell = floor(xz / 36.0);
        vec2 cc = (cell + 0.3 + 0.4 * vec2(hash21(cell), hash21(cell + 4.1))) * 36.0;
        float isStorm = step(0.55, hash21(cell + 8.3));
        float fl = clamp(audioKick * 1.3, 0.0, 1.0) * (0.5 + 0.5 * sin(hash21(cell + 2.0) * 6.28 + audioAdvance * 0.7));
        float glow = exp(-dot(xz - cc, xz - cc) / 60.0) * isStorm * fl * sp;
        c += vec3(0.7, 0.8, 1.0) * glow * (1.4 - 0.6 * smoothstep(0.0, 8.0, h0));

        // Aerial perspective into the warm haze.
        float fog = 1.0 - exp(-t * 0.0055);
        col = mix(c, hazeC * (0.9 + 0.3 * swell), fog);
    }

    col *= 0.92 + 0.16 * audioLevel;
    if (hue > 0.001) col = hueRot(col, 0.2 * sin(hue));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
