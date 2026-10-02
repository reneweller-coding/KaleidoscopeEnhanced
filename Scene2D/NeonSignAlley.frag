#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file NeonSignAlley.frag
 * @brief NEON SIGN ALLEY: a narrow back street at night, hundreds of neon
 * blade signs hanging off both walls into the depth, rain falling through
 * their light and the wet asphalt mirroring all of it.  The camera glides
 * down the alley at a steady walking pace; each sign belongs to a spectrum
 * band and burns with it, so the whole street plays the music as light.
 *
 * Audio Reactivity:
 *   audioSpectrum[32] -> brightness of each sign (its band)
 *   sceneAdvance      -> the walk down the alley (continuous)
 *   audioSwell        -> haze density (slow)
 *   audioHigh         -> rain sparkle (light)
 *   audioKick         -> a soft surge of the whole neon glow (light only)
 *
 * Per-activation variety: densityP (signs per metre), hueP.
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
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioHigh;   ///< High band level, 0..1.
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.

uniform float densityP;   ///< Density knob, 0..1.
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

/// @brief Pseudo-random number 0..1 from a float.
float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
/// @brief Pseudo-random number 0..1 from a 2D point.
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
/// @brief Smooth 2D value noise, 0..1.
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}

const float W = 1.0;        ///< half width of the alley
const float H = 3.4;        ///< eaves height
const int   NSIGN = 16;     ///< slots looked at ahead (two blades per slot)

float g_sp;                 ///< slot spacing along the alley
float g_hue;

/// @brief Rotates a colour's hue by an angle (about the grey axis).
vec3 hueRot(vec3 c, float a)
{
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

/// Saturated neon colour for a sign.  A street of neon IS many colours (a
/// documented rainbow identity, V8b): the photo arc gives the base, each sign
/// turns it by its own angle, and the result is pushed toward pure hue.
vec3 neonCol(float id)
{
    vec3 c = imgPalette(g_hue * 0.159 + hash11(id * 1.7) * 0.5);
    c = hueRot(max(c, 0.05), hash11(id * 4.1) * 6.2831853);
    c = max(c, 0.0);
    float m = max(c.r, max(c.g, c.b));
    c = c / max(m, 1e-3);
    c = pow(c, vec3(2.6));
    return mix(c, vec3(1.0), 0.1);
}

float bandOf(float id) { return clamp(audioSpectrum[int(mod(id * 7.0, 32.0))] * 1.6, 0.0, 1.0); }

/// Emission and coverage of one blade sign at slot k, seen along the ray.
/// A blade stands perpendicular to its wall: the plane z = zk, spanning x
/// from the wall inward.  Returns rgb emission, a = coverage.
vec4 blade(vec3 ro, vec3 rd, float k, float side)
{
    float id = k * 2.0 + (side > 0.0 ? 1.0 : 0.0);
    if (hash11(id * 9.1) < 0.18) return vec4(0.0);       // a gap now and then
    float zk = k * g_sp + (0.2 + 0.5 * hash11(id * 6.3)) * g_sp;
    float t = (zk - ro.z) / rd.z;
    if (t <= 0.05) return vec4(0.0);
    vec3 hp = ro + rd * t;
    float depth = 0.3 + 0.25 * hash11(id * 5.1);         // how far it sticks out
    float y0 = 0.7 + 1.3 * hash11(id * 7.9);
    float hgt = 0.8 + 1.1 * hash11(id * 2.7);
    k = id;
    // local coords on the blade: u across (0 at wall), v up
    float u = (side * hp.x - (W - depth)) / depth;        // 0..1 inside
    float v = (hp.y - y0) / hgt;
    vec2 q = vec2(u, v);
    vec2 dEdge = min(q, 1.0 - q);
    float edge = min(dEdge.x * depth, dEdge.y * hgt);     // metres to the border (<0 outside)
    if (edge < -0.6) return vec4(0.0);
    float inside = smoothstep(-0.004, 0.004, edge);
    float e = bandOf(k);
    vec3 nc = neonCol(k);
    // Border tube + glyph strokes on a dark panel.
    float tube = exp(-abs(edge - 0.035) * 90.0);
    vec2 gq = vec2(q.x * 3.0, q.y * 7.0 * hgt);
    vec2 gc = floor(gq), gf = fract(gq);
    float glyph = step(0.45, hash21(gc + k * 13.0)) * smoothstep(0.42, 0.28, abs(gf.x - 0.5))
                * smoothstep(0.45, 0.30, abs(gf.y - 0.5));
    glyph *= step(0.12, q.x) * step(q.x, 0.88) * step(0.08, q.y) * step(q.y, 0.92);
    float lum = 0.45 + 1.1 * e;
    vec3 em = nc * (tube * 1.4 + glyph * 0.9) * lum;
    em += nc * 0.12 * lum;                                 // panel glow
    em *= inside;
    // The halo the tube throws into the rain air around the sign.
    em += nc * lum * 0.22 * exp(-max(-edge, 0.0) * 9.0) * (1.0 - inside);
    // Distance fade toward the far end.
    float fog = exp(-t * 0.03);
    return vec4(em * fog, inside);
}

/// Everything the ray sees above the floor: walls, sky strip and signs.
vec3 alley(vec3 ro, vec3 rd, out float tWall)
{
    float tw = (W) / max(abs(rd.x), 1e-4);
    vec3 wp = ro + rd * tw;
    vec3 col;
    float k0 = floor(ro.z / g_sp);
    if (wp.y > H)
    {
        // Sky strip between the eaves: city glow over rain clouds.
        float ts = (H - ro.y) / max(rd.y, 1e-4);
        vec3 sp = ro + rd * ts;
        float cl = noise2(sp.xz * vec2(1.2, 0.25) + vec2(0.0, sceneTime * 0.05));
        col = mix(vec3(0.02, 0.02, 0.05), imgPalette(g_hue * 0.159 + 0.6) * 0.12, cl);
        tWall = ts;
    }
    else
    {
        // Facade: dark wall, photo as grime, lit windows, pipes.
        vec2 fw = vec2(wp.z * 0.45, wp.y * 0.5);
        vec3 grime = img(fract(fw * vec2(0.23, 0.4))) * 0.08;
        col = grime + vec3(0.012, 0.012, 0.018);
        vec2 wc = floor(vec2(wp.z / 1.3, wp.y / 0.9)), wf = fract(vec2(wp.z / 1.3, wp.y / 0.9));
        float win = step(0.62, hash21(wc + sign(rd.x) * 17.0)) * step(1.0, wp.y)
                  * smoothstep(0.02, 0.06, min(min(wf.x, 1.0 - wf.x), min(wf.y, 1.0 - wf.y)) - 0.12);
        col += imgPalette(g_hue * 0.159 + hash21(wc) * 0.4 + 0.1) * win * 0.12;
        // Flat signs on the facade, seen at a grazing angle: neon frames.
        vec2 sq = vec2(wp.z / 2.3, (wp.y - 0.6) / 1.1);
        vec2 sc = floor(sq), sf = fract(sq);
        float sid = hash21(sc + sign(rd.x) * 31.0) * 100.0;
        if (hash11(sid) > 0.45 && wp.y > 0.6 && wp.y < H - 0.3)
        {
            vec2 box = vec2(0.12 + 0.2 * hash11(sid + 1.0), 0.18 + 0.15 * hash11(sid + 2.0));
            vec2 dd = abs(sf - 0.5) - (0.5 - box);
            float be = max(dd.x, dd.y);
            float fr = exp(-abs(be) * 55.0);
            vec3 nc = neonCol(sid);
            float e = bandOf(sid);
            col += nc * (fr * 1.1 + step(be, 0.0) * 0.12) * (0.4 + 1.0 * e);
        }
        // Spill: nearby blade signs light the wall they hang on.
        for (int i = -1; i < NSIGN; ++i)
        {
            float k = k0 + float(i);
            float side = sign(rd.x);
            float zk = k * g_sp + 0.45 * g_sp;
            float id = k * 2.0 + (side > 0.0 ? 1.0 : 0.0);
            float y0 = 0.7 + 1.3 * hash11(id * 7.9) + 0.9;
            float dz = wp.z - zk, dy = wp.y - y0;
            col += neonCol(id) * (0.35 + 1.0 * bandOf(id)) * 0.07 / (0.25 + dz * dz + 0.6 * dy * dy);
        }
        tWall = tw;
        col *= exp(-tw * 0.03);
    }
    // Signs, far to near (painter's order), both walls.
    for (int i = NSIGN - 1; i >= 0; --i)
    {
        for (int s = 0; s < 2; ++s)
        {
            vec4 b = blade(ro, rd, k0 + float(i) + 1.0, s == 0 ? -1.0 : 1.0);
            col = mix(col, col * 0.25, b.a * 0.8) + b.rgb;
        }
    }
    return col;
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

    g_hue = (hueP > 0.001) ? hueP : 0.0;
    g_sp = mix(1.9, 1.1, clamp(densityP, 0.0, 1.0));
    float haze = 0.5 + 0.7 * clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);

    // The walk: steady, on the music's pace; never on a beat.
    float walk = sceneAdvance * 0.55 + sceneTime * 0.35;
    vec3 ro = vec3(0.0, 1.25, walk);
    vec3 rd = normalize(vec3(p.x, p.y + 0.08, 1.35));

    float tWall;
    vec3 col = alley(ro, rd, tWall);

    // Wet floor: a rippled mirror of the alley, darker, with puddles.
    if (rd.y < 0.0)
    {
        float tf = -ro.y / rd.y;
        if (tf < tWall)
        {
            vec3 fp = ro + rd * tf;
            float puddle = smoothstep(0.35, 0.6, noise2(fp.xz * vec2(1.6, 0.7)));
            // Rain rings: round, expanding, in jittered cells.
            vec2 rc = floor(fp.xz * 3.0), rf = fract(fp.xz * 3.0) - 0.5;
            vec2 rj = vec2(hash21(rc + 3.1), hash21(rc + 8.7)) - 0.5;
            float ph = fract(sceneTime * 0.7 + hash21(rc));
            float ring = exp(-abs(length(rf - rj * 0.5) - ph * 0.45) * 60.0) * (1.0 - ph);
            vec2 wob = vec2(noise2(fp.xz * 9.0 + sceneTime), noise2(fp.xz * 9.0 - sceneTime)) - 0.5;
            vec3 rr = normalize(vec3(rd.x + wob.x * 0.02, -rd.y, rd.z + wob.y * 0.02 + ring * 0.03));
            float dummy;
            vec3 refl = alley(fp + vec3(0.0, 0.001, 0.0), rr, dummy);
            float fres = mix(0.35, 0.8, puddle);
            vec3 asphalt = img(fract(fp.xz * vec2(0.2, 0.05))) * 0.03 + vec3(0.01);
            col = asphalt + refl * fres * (0.55 + 0.45 * puddle);
            col *= exp(-tf * 0.03);
        }
    }

    // Haze: the neon light scattered in the rain air.
    vec3 hazeCol = imgPalette(g_hue * 0.159 + 0.25) * 0.10 + vec3(0.02, 0.015, 0.04);
    float dist = min(tWall, 40.0);
    // The lit crossing at the far end of the alley glows through the haze.
    float endGlow = exp(-dot(p - vec2(0.0, 0.05), p - vec2(0.0, 0.05)) * 14.0);
    hazeCol *= 1.0 + 2.5 * endGlow;
    col = mix(col, hazeCol * (1.0 + 0.4 * clamp(audioKick, 0.0, 2.0)), (1.0 - exp(-dist * 0.035 * haze)) * 0.85);

    // Rain: short soft streaks falling steadily, in two depth layers.
    for (int l = 0; l < 2; ++l)
    {
        float fl = float(l);
        vec2 g = vec2(p.x * (55.0 + fl * 35.0), p.y * (5.0 + fl * 3.0) + sceneTime * (7.0 + fl * 3.0));
        vec2 c = floor(g), f = fract(g) - 0.5;
        float jx = hash21(c + fl * 5.0) - 0.5;
        float streak = smoothstep(0.07, 0.0, abs(f.x - jx * 0.6)) * smoothstep(0.5, 0.1, abs(f.y));
        streak *= step(0.72, hash21(c + 11.0 + fl));
        col += hazeCol * 3.0 * streak * (0.35 + 0.8 * hi) * (0.6 - fl * 0.25);
    }

    col *= 0.9 + 0.25 * audioLevel + 0.15 * clamp(audioKick, 0.0, 2.0);
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
