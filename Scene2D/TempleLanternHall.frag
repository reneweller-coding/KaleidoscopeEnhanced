#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file TempleLanternHall.frag
 * @brief TEMPLE LANTERN HALL: a long temple hall whose whole ceiling is
 * hung with glowing paper lanterns, row behind row into the depth, between
 * red lacquered pillars, all of it mirrored in the polished dark floor.
 * The lanterns sway very gently on their cords; each one belongs to a
 * spectrum band and brightens with it, so the music drifts through the
 * canopy as light.  We walk slowly down the hall.
 *
 * Audio Reactivity:
 *   audioSpectrum[32] -> each lantern's glow (its band)
 *   audioSwell        -> the incense haze (slow)
 *   audioKick         -> a soft warm surge through the whole canopy (light)
 *   sceneAdvance      -> the walk down the hall (continuous)
 *   sceneTime         -> the gentle sway of the lanterns (continuous)
 *
 * Per-activation variety: tintP (paper colour), hueP.
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
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
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

const float LS = 0.8;       ///< lantern spacing
const float HW = 4.0;       ///< half width of the hall
const float CH = 5.0;       ///< ceiling height

float g_hue, g_tint;

vec3 paperOf(vec2 cell)
{
    vec3 warm = mix(vec3(1.0, 0.72, 0.3), vec3(1.0, 0.45, 0.25), g_tint);
    return mix(warm, imgPalette(g_hue * 0.159 + hash21(cell) * 0.35), 0.18);
}

/// Lanterns: ellipsoids hanging in a grid under the ceiling.  Returns the
/// emission seen along the ray (front to back, first hit wins) and the hit
/// distance in tHit.
vec3 lanterns(vec3 ro, vec3 rd, out float tHit)
{
    tHit = 1e9;
    vec3 em = vec3(0.0);
    // Intersect the lantern layer (y between 2.6 and 4.6) by stepping
    // through its grid cells along the ray.
    float t0 = (4.6 - ro.y) / rd.y, t1 = (2.6 - ro.y) / rd.y;
    float ta = max(min(t0, t1), 0.0), tb = max(t0, t1);
    if (rd.y > -1e-4 && ro.y < 2.6) { ta = (2.6 - ro.y) / max(rd.y, 1e-4); tb = (4.6 - ro.y) / max(rd.y, 1e-4); }
    float t = ta;
    for (int i = 0; i < 64; ++i)
    {
        if (t > tb || t > 45.0) break;
        vec3 p = ro + rd * t;
        vec2 cell = floor(p.xz / LS + 0.5);
        for (int dz = -1; dz <= 1; ++dz)
        for (int dx = -1; dx <= 1; ++dx)
        {
            vec2 c = cell + vec2(dx, dz);
            if (abs(c.x * LS) > HW - 0.6) continue;
            float drop = 0.2 + 1.6 * hash21(c + 7.0);           // cord length
            float sway = 0.05 * sin(sceneTime * 0.6 + hash21(c) * 6.28);
            vec3 cen = vec3(c.x * LS + sway, CH - 0.4 - drop, c.y * LS + 0.4 * sway);
            vec3 rad = vec3(0.17, 0.23, 0.17);
            // Ray-ellipsoid.
            vec3 oc = (ro - cen) / rad, dd = rd / rad;
            float a = dot(dd, dd), b = dot(oc, dd), cc = dot(oc, oc) - 1.0;
            float h = b * b - a * cc;
            if (h > 0.0)
            {
                float th = (-b - sqrt(h)) / a;
                if (th > 0.0 && th < tHit)
                {
                    tHit = th;
                    vec3 hp = (ro + rd * th - cen) / rad;
                    int band = int(mod(hash21(c + 3.0) * 32.0, 32.0));
                    float e = clamp(audioSpectrum[band] * 1.5, 0.0, 1.0);
                    // Paper glows most through its middle, ribbed by the
                    // bamboo hoops, darker at the capped ends.
                    float ribs = 0.88 + 0.12 * cos(hp.y * 18.0);
                    float ends = smoothstep(1.0, 0.7, abs(hp.y));
                    float lum = (0.55 + 1.2 * e) * (1.0 + 0.25 * clamp(audioKick, 0.0, 2.0));
                    em = paperOf(c) * ribs * (0.25 + 0.9 * ends) * lum * 1.6;
                    em = mix(vec3(0.05, 0.02, 0.01), em, ends * 0.9 + 0.1);
                    em *= exp(-th * 0.035);
                }
            }
        }
        if (tHit < 1e8) break;
        t += LS * 0.4;
    }
    return em;
}

vec3 hall(vec3 ro, vec3 rd, out float tOut)
{
    float tl;
    vec3 col = lanterns(ro, rd, tl);
    float tw = (rd.x > 0.0 ? HW - ro.x : -HW - ro.x) / rd.x;
    float tc = (CH - ro.y) / max(rd.y, 1e-4);
    if (rd.y <= 0.0) tc = 1e9;
    tOut = min(tl, min(tw, tc));
    // Warm light that the canopy throws on everything around it.
    vec3 glow = mix(vec3(1.0, 0.62, 0.3), imgPalette(g_hue * 0.159 + 0.08), 0.2) * (0.6 + 0.3 * clamp(audioKick, 0.0, 2.0));
    if (tl < 1e8 && tl <= tw && tl <= tc) return col;
    if (tc < tw)
    {
        // The ceiling: dark coffers lit from below.
        vec3 cp = ro + rd * tc;
        vec2 cf = fract(cp.xz * 0.8);
        float beam = smoothstep(0.08, 0.0, min(cf.x, cf.y));
        col = mix(vec3(0.08, 0.03, 0.02), vec3(0.25, 0.08, 0.04), beam) * glow * 0.6;
        return col * exp(-tc * 0.04);
    }
    // The side walls: red lacquered pillars and gilded screens between.
    vec3 wp = ro + rd * tw;
    float pil = smoothstep(0.12, 0.08, abs(fract(wp.z / (LS * 3.0)) - 0.5) * LS * 3.0 - 0.12);
    vec3 screen = img(fract(vec2(wp.z * 0.08, wp.y * 0.18))) * vec3(0.5, 0.38, 0.2) * 0.6;
    vec3 wall = mix(screen, vec3(0.45, 0.06, 0.04), pil);
    wall *= glow * (0.35 + 0.65 * smoothstep(0.0, CH, wp.y));
    return wall * exp(-tw * 0.04);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    g_hue = (hueP > 0.001) ? hueP : 0.0;
    g_tint = clamp(tintP, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);

    float walk = sceneAdvance * 0.3 + sceneTime * 0.15;
    vec3 ro = vec3(0.0, 1.4, walk);
    vec3 rd = normalize(vec3(p.x, p.y + 0.12, 1.1));

    float tHit;
    vec3 col = hall(ro, rd, tHit);

    // Polished floor: a soft mirror.
    if (rd.y < 0.0)
    {
        float tf = -ro.y / rd.y;
        vec3 fp = ro + rd * tf;
        vec3 rr = vec3(rd.x, -rd.y, rd.z);
        float tr;
        vec3 refl = hall(fp, rr, tr);
        vec3 wood = img(fract(fp.xz * vec2(0.1, 0.03))) * 0.05;
        // (Grazing reflections near the horizon smear into a line: fade them.)
        col = wood + refl * 0.55 * smoothstep(0.0, 0.06, -rd.y);
        col *= exp(-tf * 0.03);
    }

    // Incense haze glowing with the canopy.
    vec3 hazeC = mix(vec3(0.5, 0.28, 0.12), imgPalette(g_hue * 0.159 + 0.1) * 0.5, 0.25);
    col += hazeC * (1.0 - exp(-min(tHit, 40.0) * 0.04)) * (0.12 + 0.2 * swell) * smoothstep(-0.3, 0.4, p.y);
    // The far end of the hall: the rows of lanterns merge into one glow.
    vec2 vp = p - vec2(0.0, 0.07);
    col += hazeC * 1.4 * exp(-dot(vp, vp) * 16.0) * (0.6 + 0.4 * swell);

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
