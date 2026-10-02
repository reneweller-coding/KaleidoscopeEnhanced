#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file LibraryOfBabel.frag
 * @brief LIBRARY OF BABEL: Borges' library -- an endless stack of hexagonal
 * galleries around a central air shaft, floor above floor above floor
 * without end, each gallery's walls lined with shelves of books, a low
 * railing at the edge of every floor, a warm lamp hanging in each
 * gallery.  The camera rises steadily up the shaft, looking out across it
 * at the galleries sliding past, the floors above and below vanishing
 * into warm darkness.  The lamps glow with the music.
 *
 * The shaft, floors and walls are traced analytically (a hexagonal prism
 * inside a hexagonal prism, cut by the floor slabs).
 *
 * Audio Reactivity:
 *   audioBass   -> the glow of the lamps (light)
 *   audioSwell  -> the warmth of the dust in the shaft (slow)
 *   audioLevel  -> brightness
 *   sceneTime / sceneAdvance -> the steady climb (constant speed)
 *
 * Per-activation variety: viewP (where the camera looks), hueP.
 */

uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float sceneTime;   ///< Seconds since this scene was activated.
uniform float sceneAdvance;   ///< The music's advance since this scene was activated (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioBass;   ///< Bass band level, 0..1.
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float viewP;
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

const float RS = 4.2;     ///< apothem of the shaft
const float RW = 6.2;     ///< apothem of the gallery walls
const float LH = 2.8;     ///< level height
const float SLAB = 0.3;  ///< floor thickness
float gLamp;

/// Exit of a ray (from inside) through a hexagonal prism of apothem R.
float hexExit(vec2 o, vec2 d, float R, out int face)
{
    float t = 1e9; face = 0;
    for (int i = 0; i < 6; ++i) {
        float a = float(i) * 1.0471976;
        vec2 n = vec2(cos(a), sin(a));
        float dn = dot(d, n);
        if (dn > 1e-5) {
            float ti = (R - dot(o, n)) / dn;
            if (ti < t) { t = ti; face = i; }
        }
    }
    return t;
}

/// Book spines on a shelf wall at (u along the wall, y height).
vec3 books(float u, float y, float lev)
{
    float sy = y / 0.42;
    float shelf = floor(sy), fy = fract(sy);
    // Books: jittered widths along the shelf, a height and a colour each.
    float bu = u * 26.0 + hash21(vec2(shelf, lev)) * 10.0;
    float bi = floor(bu + 0.4 * noise2(vec2(bu * 0.5, shelf)));
    float bf = fract(bu);
    float h = hash21(vec2(bi, shelf + lev * 13.0));
    vec3 bc = 0.5 + 0.5 * cos(6.2831853 * (h * 0.4 + vec3(0.0, 0.1, 0.25) + 0.05));
    bc = mix(bc * vec3(0.55, 0.3, 0.2), vec3(0.2, 0.12, 0.08), 0.35 * hash21(vec2(bi, 7.0)));
    bc = mix(bc, imgPalette(h + hueP * 0.159) * 0.6, 0.15);
    float top = 0.62 + 0.3 * hash21(vec2(bi, shelf + 3.0));
    float isBook = step(fy, top) * step(0.06, fy);
    vec2 fw = fwidth(vec2(bu, sy));
    float gap = smoothstep(0.0, fw.x * 1.5 + 0.02, bf) * smoothstep(1.0, 1.0 - fw.x * 1.5 - 0.02, bf);
    vec3 wood = vec3(0.22, 0.12, 0.06);
    vec3 c = mix(wood * 0.4, bc * (0.7 + 0.3 * gap), isBook);
    // A gilt band on some spines.
    c += vec3(0.5, 0.4, 0.2) * step(0.7, h) * smoothstep(0.03, 0.0, abs(fy - top * 0.8)) * isBook * 0.5;
    // The shelf board.
    c = mix(c, wood * 1.3, smoothstep(0.06 + fw.y, 0.06, fy));
    // Far away the spines blur into an even tone.
    float lod = smoothstep(0.35, 0.8, fw.x);
    return mix(c, mix(wood * 0.5, vec3(0.3, 0.17, 0.1), 0.7), lod);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float bass = clamp(audioBass, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float T = sceneTime + sceneAdvance * 0.4;
    gLamp = 0.8 + 0.6 * bass;

    // Rising up the shaft at an even pace, looking out across it.
    // Near the shaft's edge, looking steeply up it: the floors ring the
    // shaft and recede toward a vanishing point far above.
    float pitch = 0.22 + 0.35 * clamp(viewP, 0.0, 1.0);
    vec3 ro = vec3(-1.2, T * 0.35, 0.3);
    vec3 fw = normalize(vec3(cos(pitch), sin(pitch), 0.12));
    vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
    vec3 up = cross(rt, fw);
    vec3 rd = normalize(p.x * rt + p.y * up + 1.2 * fw);

    int fS;
    float tS = hexExit(ro.xz, rd.xz, RS, fS);
    vec3 PS = ro + rd * tS;
    float lev = floor(PS.y / LH);
    float ly = PS.y - lev * LH;                              // height within the level

    vec3 col = vec3(0.0);
    float tHit;
    vec3 lampPos = vec3(0.0);
    if (ly < SLAB) {
        // The edge of a floor slab: dark wood with a lighter lip.
        float fa0 = float(fS) * 1.0471976;
        vec3 Lb = vec3(cos(fa0) * 4.7, lev * LH - 0.7, sin(fa0) * 4.7);
        float lb = gLamp * 3.0 / (1.0 + dot(PS - Lb, PS - Lb) * 0.3) + 0.1;
        col = vec3(0.3, 0.17, 0.09) * (0.6 + 0.4 * smoothstep(SLAB, SLAB - 0.05, ly)) * lb;
        tHit = tS;
    } else {
        // Into the gallery: back wall, its floor or its ceiling.
        int fW;
        float tW = hexExit(ro.xz, rd.xz, RW, fW);
        float yFloor = lev * LH + SLAB, yCeil = (lev + 1.0) * LH;
        float tF = rd.y < 0.0 ? (yFloor - ro.y) / rd.y : 1e9;
        float tC = rd.y > 0.0 ? (yCeil - ro.y) / rd.y : 1e9;
        tHit = min(tW, min(tF, tC));
        vec3 P = ro + rd * tHit;
        float fa = float(fW) * 1.0471976;
        vec2 fn = vec2(cos(fa), sin(fa));
        lampPos = vec3(fn.x * 4.7, yCeil - 0.7, fn.y * 4.7);
        float dl = length(P - lampPos);
        float light = gLamp * 3.2 / (1.0 + dl * dl * 0.3) + 0.04;
        if (tHit == tW) {
            // Four of the six walls carry shelves; two open onto the stairs.
            float u = dot(P.xz, vec2(-fn.y, fn.x));
            bool shelves = mod(float(fW) + lev, 3.0) > 0.5;
            vec3 wc = shelves ? books(u, P.y - yFloor, lev + float(fW) * 17.0)
                              : vec3(0.12, 0.08, 0.05) * (0.7 + 0.3 * smoothstep(0.02, 0.0, abs(fract(u * 1.5 + (P.y - yFloor) * 0.8) - 0.5) - 0.4));
            col = wc * light;
        } else if (tHit == tF) {
            col = vec3(0.3, 0.18, 0.1) * (0.8 + 0.2 * noise2(P.xz * vec2(1.0, 8.0))) * light * 0.8;
        } else {
            col = vec3(0.16, 0.1, 0.06) * light * (0.85 + 0.15 * smoothstep(0.02, 0.0, abs(fract(dot(P.xz, vec2(-fn.y, fn.x)) * 1.2) - 0.5) - 0.45));
        }
        // The low railing at the shaft's edge, in front of the gallery.
        if (ly < SLAB + 0.95) {
            float u = dot(PS.xz, vec2(-sin(float(fS) * 1.0471976), cos(float(fS) * 1.0471976)));
            float fwu = fwidth(u * 6.0);
            float bal = smoothstep(0.18 + fwu, 0.18, abs(fract(u * 6.0) - 0.5) - 0.3);
            float rail = smoothstep(0.05, 0.03, abs(ly - SLAB - 0.9));
            float cov = max(bal * 0.9, rail);
            vec3 rc = vec3(0.2, 0.11, 0.05) * (0.3 + 0.4 * gLamp);
            col = mix(col, rc, cov);
            if (cov > 0.5) tHit = tS;
        }
    }
    // The lamps: warm globes hanging in the galleries, seen with their halo.
    for (int k = -1; k <= 1; ++k) {
        for (int f = 0; f < 6; ++f) {
            float fa = float(f) * 1.0471976;
            float lv = lev + float(k);
            vec3 L = vec3(cos(fa) * 4.7, (lv + 1.0) * LH - 0.7, sin(fa) * 4.7);
            vec3 v = L - ro;
            float tl = dot(v, rd);
            if (tl <= 0.0 || tl > tHit + 0.3) continue;
            float d = length(v - rd * tl);
            float glob = smoothstep(0.17, 0.14, d);
            col = mix(col, vec3(1.0, 0.78, 0.45) * (1.2 + 0.8 * sqrt(max(1.0 - d * d / 0.0289, 0.0))) * gLamp, glob);
            col += vec3(1.0, 0.65, 0.3) * 0.08 * gLamp * exp(-d * 3.0) / (1.0 + tl * 0.05);
        }
    }
    // Warm dusty air in the shaft; far floors sink into darkness.
    col = mix(col, vec3(0.2, 0.12, 0.06) * (0.8 + 0.6 * swell), 1.0 - exp(-tHit * 0.05));

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
