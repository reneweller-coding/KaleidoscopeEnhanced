#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file BasilicaCisternColumns.frag
 * @brief BASILICA CISTERN COLUMNS: an underground cistern -- a forest of
 * stone columns under brick cross vaults, standing in black water that
 * mirrors all of it.  Every column is lit from its foot by a warm uplight;
 * drops fall from the vault and ring the water.  We glide slowly between
 * the rows.  Each uplight belongs to a spectrum band and swells with it, so
 * the music moves through the hall as light along the colonnade.
 *
 * Audio Reactivity:
 *   audioSpectrum[32] -> each column's uplight (its band)
 *   audioSwell        -> the haze in the hall (slow)
 *   audioHigh         -> glints on the water rings (light)
 *   sceneAdvance      -> the glide between the columns (continuous)
 *
 * Per-activation variety: lightP (warm/cool uplights), hueP.
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
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.

uniform float lightP;
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
/// @brief Smooth 2D value noise, 0..1.
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}

const float SP = 3.0;       ///< column spacing
const float H  = 4.2;       ///< springing of the vaults
const float CR = 0.34;      ///< column radius

float g_hue, g_light;

/// Scene distance: repeated columns with capitals, cross vaults above.
float map(vec3 p)
{
    vec2 c = floor(p.xz / SP + 0.5);
    vec2 q = p.xz - c * SP;
    float r = CR * (1.0 + 0.04 * sin(p.y * 1.3));
    float col = length(q) - r;
    // Capital: a block that widens under the vault.
    float cap = max(length(q) - (CR + 0.18 * smoothstep(H - 0.8, H - 0.2, p.y)), abs(p.y - (H - 0.45)) - 0.35);
    col = min(col, cap);
    // Cross vault: each bay is covered by two intersecting barrel vaults;
    // the ceiling height rises from H at the columns to H + 1.3 mid-bay.
    vec2 b = abs(p.xz - (floor(p.xz / SP) + 0.5) * SP) / (0.5 * SP);   // 0 mid-bay .. 1 at the arch lines
    float arch = H + 1.3 * sqrt(max(1.0 - max(b.x, b.y) * max(b.x, b.y), 0.0));
    float vault = arch - p.y;
    return min(col, vault);
}

vec3 normalAt(vec3 p)
{
    vec2 e = vec2(0.004, 0.0);
    return normalize(vec3(map(p + e.xyy) - map(p - e.xyy), map(p + e.yxy) - map(p - e.yxy), map(p + e.yyx) - map(p - e.yyx)));
}

/// The uplights: one at the foot of each column.  Returns the light arriving
/// at point p with normal n from the nearest four columns.
vec3 uplight(vec3 p, vec3 n)
{
    vec3 acc = vec3(0.0);
    vec2 c0 = floor(p.xz / SP);
    for (int j = 0; j < 2; ++j)
    for (int i = 0; i < 2; ++i)
    {
        vec2 c = c0 + vec2(i, j);
        vec3 L = vec3(c.x * SP, 0.15, c.y * SP);
        vec2 dir = normalize(p.xz - L.xz + 1e-4);
        L.xz += dir * (CR + 0.12);                           // on the column's face
        vec3 d = L - p;
        float dist = length(d);
        float lam = clamp(dot(n, d / dist), 0.0, 1.0);
        int band = int(mod(hash21(c) * 32.0, 32.0));
        float e = clamp(audioSpectrum[band] * 1.5, 0.0, 1.0);
        vec3 lc = mix(vec3(1.0, 0.45, 0.18), vec3(0.9, 0.7, 0.5), g_light);
        lc = mix(lc, imgPalette(g_hue * 0.159 + hash21(c + 3.0) * 0.3), 0.2);
        // A spot aimed up the column: strong at its foot, fading upward.
        float up = max(exp(-max(p.y - 0.2, 0.0) * 0.55), 0.3);
        acc += lc * lam * (0.9 + 1.3 * e) * 4.5 * up / (1.0 + dist * dist * 0.5);
    }
    return acc;
}

vec3 shade(vec3 ro, vec3 rd, out float tHit)
{
    float t = 0.05;
    tHit = 60.0;
    for (int i = 0; i < 90; ++i)
    {
        vec3 p = ro + rd * t;
        float d = map(p);
        if (d < 0.002 * t) { tHit = t; break; }
        t += d * 0.9;
        if (t > 60.0 || p.y < 0.0) break;
    }
    vec3 col = vec3(0.0);
    if (tHit < 60.0)
    {
        vec3 p = ro + rd * tHit;
        vec3 n = normalAt(p);
        // Stone and brick from the photo, dark and warm.
        vec3 stone = img(fract(vec2(p.x * 0.07 + p.z * 0.05, p.y * 0.05 + 0.3))) * 0.2 + vec3(0.16, 0.13, 0.1);
        stone *= 0.8 + 0.35 * noise2(vec2(atan(p.x - floor(p.x / SP + 0.5) * SP, p.z - floor(p.z / SP + 0.5) * SP) * 3.0, p.y * 2.0));
        if (p.y > H - 0.1)
        {
            vec2 bq = vec2(p.x * 3.0 + p.z * 0.3, p.y * 6.0);
            vec2 bi = floor(bq), bf = fract(bq);
            float mortar = smoothstep(0.0, 0.08, min(min(bf.x, 1.0 - bf.x), min(bf.y, 1.0 - bf.y)));
            stone = mix(vec3(0.05, 0.04, 0.03), vec3(0.35, 0.18, 0.1) * (0.7 + 0.5 * hash21(bi)), mortar);
        }
        col = stone * (uplight(p, n) + vec3(0.05, 0.035, 0.025));
        col *= exp(-tHit * 0.06);
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
    g_light = clamp(lightP, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);

    // The glide: down the aisle between two rows, steady.
    float glide = sceneAdvance * 0.35 + sceneTime * 0.18;
    vec3 ro = vec3(SP * 0.5 + 0.2 * sin(glide * 0.11), 0.95, glide);
    vec3 fwd = normalize(vec3(0.18 * sin(glide * 0.07), -0.04, 1.0));
    vec3 rgt = normalize(cross(vec3(0.0, 1.0, 0.0), fwd));
    vec3 up = cross(fwd, rgt);
    vec3 rd = normalize(fwd * 1.1 + rgt * p.x + up * p.y);

    float tHit;
    vec3 col = shade(ro, rd, tHit);

    // The water: a black mirror at y = 0 with drop rings.
    if (rd.y < 0.0)
    {
        float tw = -ro.y / rd.y;
        if (tw < tHit)
        {
            vec3 wp = ro + rd * tw;
            vec2 rc = floor(wp.xz * 0.7), rf = fract(wp.xz * 0.7) - 0.5;
            vec2 rj = hash22(rc) - 0.5;
            float ph = fract(sceneTime * 0.35 + hash21(rc + 5.0));
            float ring = sin((length(rf - rj * 0.5) - ph * 0.5) * 60.0) * exp(-abs(length(rf - rj * 0.5) - ph * 0.5) * 25.0) * (1.0 - ph);
            vec3 rr = normalize(vec3(rd.x + ring * 0.01, -rd.y, rd.z + ring * 0.01));
            float tr;
            vec3 refl = shade(wp + vec3(0.0, 0.001, 0.0), rr, tr);
            float fres = 0.35 + 0.4 * pow(1.0 + rd.y, 5.0);
            col = refl * fres + vec3(0.004, 0.006, 0.008);
            col += vec3(1.0, 0.8, 0.6) * max(ring, 0.0) * 0.05 * (0.3 + hi) * exp(-tw * 0.1);
            col *= exp(-tw * 0.04);
        }
    }

    // Haze: warm light hanging in the damp air.
    vec3 hazeC = mix(vec3(0.3, 0.15, 0.07), imgPalette(g_hue * 0.159 + 0.1) * 0.3, 0.3);
    float dist = min(tHit, 40.0);
    col += hazeC * (1.0 - exp(-dist * 0.04)) * (0.15 + 0.25 * swell);

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
