#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file SolidLightCones.frag
 * @brief SOLID LIGHT CONES: a dark hall filled with haze, and projectors at
 * its far end whose beams become surfaces -- each projects a slowly
 * changing line drawing onto the wall behind the viewer, and in the haze
 * that line becomes a luminous sheet stretching from the lens to us (after
 * Anthony McCall's solid-light works).  We stand inside the cones.  Each
 * drawing belongs to a band group and brightens with it; the haze drifts
 * and thickens with the swell.  Camera fixed.
 *
 * Audio Reactivity:
 *   audioBass / audioMid / audioHigh -> brightness of the three drawings
 *   audioSwell        -> haze density (slow)
 *   sceneAdvance      -> the drawings morph (continuous, never on a beat)
 *   audioKick         -> the lenses flare (light)
 *
 * Per-activation variety: shapeP (which drawings), hueP.
 */
uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float sceneAdvance;   ///< The music's advance since this scene was activated (integrated, never jumps).
uniform float sceneTime;   ///< Seconds since this scene was activated.
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioBass;   ///< Bass band level, 0..1.
uniform float audioMid;   ///< Mid band level, 0..1.
uniform float audioHigh;   ///< High band level, 0..1.
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.

uniform float shapeP;
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
/// @brief Pseudo-random number 0..1 from a 3D point.
float hash31(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
/// @brief Smooth 3D value noise, 0..1.
float noise3(vec3 p)
{
    vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    float a = mix(mix(hash31(i), hash31(i + vec3(1, 0, 0)), f.x), mix(hash31(i + vec3(0, 1, 0)), hash31(i + vec3(1, 1, 0)), f.x), f.y);
    float b = mix(mix(hash31(i + vec3(0, 0, 1)), hash31(i + vec3(1, 0, 1)), f.x), mix(hash31(i + vec3(0, 1, 1)), hash31(i + vec3(1, 1, 1)), f.x), f.y);
    return mix(a, b, f.z);
}

float g_clock;
float g_shape;

// Each projector draws one shape on the wall plane x = XW.  Shapes are
// ellipses (whose cone of light is a quadric) or straight lines (whose sheet
// is a plane), so the view ray meets them ANALYTICALLY -- a thin glowing
// sheet cannot be found by stepping through fog.
const float XW = 5.5;

struct Shape { int kind; vec2 c; vec2 r; float ang; };

Shape shapeOf(int j)
{
    float c = g_clock;
    Shape sh;
    if (j == 0)      { sh.kind = 0; sh.c = vec2(2.2, 0.6);  sh.r = vec2(1.9 + 0.4 * sin(c * 0.37), 1.4 + 0.3 * cos(c * 0.29)); sh.ang = 0.3 * c; }
    else if (j == 1) { sh.kind = 1; sh.c = vec2(2.0, 5.2);  sh.r = vec2(2.4, 0.0); sh.ang = 0.9 + 0.5 * sin(c * 0.23 + g_shape * 3.0); }
    else             { sh.kind = 0; sh.c = vec2(2.4, 9.4);  sh.r = vec2(1.2 + 0.3 * sin(c * 0.41), 1.9); sh.ang = -0.23 * c + g_shape * 2.0; }
    return sh;
}

/// Distance on the wall from point w (y, z) to the shape (for the drawn line).
float wallDist(Shape sh, vec2 w)
{
    vec2 d = w - sh.c;
    float ca = cos(sh.ang), sa = sin(sh.ang);
    d = vec2(ca * d.x + sa * d.y, -sa * d.x + ca * d.y);
    if (sh.kind == 0) return abs(length(d / sh.r) - 1.0) * min(sh.r.x, sh.r.y);
    return max(abs(d.y), abs(d.x) - sh.r.x);
}

/// Hit list of the view ray with the light sheet of projector P drawing sh.
/// Returns up to two (t, brightness) pairs packed as vec4.
vec4 sheetHits(vec3 ro, vec3 rd, vec3 P, Shape sh, float tWall)
{
    float a = XW - P.x;
    vec3 u0 = ro - P;
    vec2 pc = P.yz - sh.c;
    // L(u) = pc * u.x + a * u.yz  (the drawing-plane offset times u.x)
    vec2 L0 = pc * u0.x + a * u0.yz;
    vec2 L1 = pc * rd.x + a * rd.yz;
    float ca = cos(sh.ang), sa = sin(sh.ang);
    mat2 R = mat2(ca, -sa, sa, ca);            // columns: rotate into shape frame
    vec4 res = vec4(-1.0, 0.0, -1.0, 0.0);
    if (sh.kind == 0)
    {
        vec2 m0 = (R * L0) / sh.r, m1 = (R * L1) / sh.r;
        float A = dot(m1, m1) - rd.x * rd.x;
        float B = 2.0 * dot(m0, m1) - 2.0 * u0.x * rd.x;
        float C = dot(m0, m0) - u0.x * u0.x;
        float disc = B * B - 4.0 * A * C;
        if (disc < 0.0 || abs(A) < 1e-6) return res;
        float sq = sqrt(disc);
        float ts[2];
        ts[0] = (-B - sq) / (2.0 * A);
        ts[1] = (-B + sq) / (2.0 * A);
        for (int k = 0; k < 2; ++k)
        {
            float t = ts[k];
            vec3 u = u0 + rd * t;
            if (t <= 0.0 || t >= tWall || u.x <= 0.05 || u.x >= a) continue;
            vec2 L = pc * u.x + a * u.yz;
            vec2 g = transpose(R) * (((R * L) / sh.r) / sh.r);   // M^T M L
            vec3 n = normalize(vec3(dot(pc, g) - u.x, a * g.x, a * g.y));
            float graze = 1.0 / max(abs(dot(rd, n)), 0.06);
            float b = graze * (0.35 + 0.65 * (u.x / a));       // sheet thickens toward the wall
            if (k == 0) res.xy = vec2(t, b); else res.zw = vec2(t, b);
        }
        return res;
    }
    // A straight line: the sheet is a plane through the lens.
    vec2 nl = vec2(-sa, ca);                   // normal of the line on the wall
    float den = dot(nl, L1);
    if (abs(den) < 1e-6) return res;
    float t = -dot(nl, L0) / den;
    vec3 u = u0 + rd * t;
    if (t <= 0.0 || t >= tWall || u.x <= 0.05 || u.x >= a) return res;
    vec2 q = (pc * u.x + a * u.yz) / u.x;      // point on the wall, relative to centre
    float along = abs(dot(q, vec2(ca, sa)));
    if (along > sh.r.x) return res;
    vec3 n = normalize(vec3(dot(pc, nl), a * nl.x, a * nl.y));
    float graze = 1.0 / max(abs(dot(rd, n)), 0.06);
    res.xy = vec2(t, graze * (0.35 + 0.65 * (u.x / a)) * smoothstep(sh.r.x, sh.r.x * 0.85, along));
    return res;
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    g_shape = clamp(shapeP, 0.0, 1.0);
    g_clock = sceneAdvance * 0.35 + sceneTime * 0.12;
    float haze = 0.55 + 0.65 * clamp(audioSwell, 0.0, 1.0);
    float bands[3];
    bands[0] = clamp(audioBass * 1.3, 0.0, 1.0);
    bands[1] = clamp(audioMid * 1.6, 0.0, 1.0);
    bands[2] = clamp(audioHigh * 2.2, 0.0, 1.0);

    // Seen from the side, turned a little toward the wall.
    vec3 ro = vec3(-2.6, 1.3, -2.8);
    vec3 fwd = normalize(vec3(0.75, 0.12, 1.0));
    vec3 rgt = normalize(cross(vec3(0.0, 1.0, 0.0), fwd));
    vec3 up = cross(fwd, rgt);
    vec3 rd = normalize(fwd * 1.2 + rgt * p.x + up * p.y);

    vec3 P[3];
    P[0] = vec3(-7.5, 2.3, 1.0);
    P[1] = vec3(-7.0, 1.6, 4.5);
    P[2] = vec3(-7.8, 2.8, 8.0);
    vec3 beamCol[3];
    for (int j = 0; j < 3; ++j)
    {
        vec3 c = imgPalette(hue * 0.159 + float(j) * 0.18 + 0.05);
        beamCol[j] = mix(vec3(0.95, 0.95, 1.0), c * 1.3, 0.35);   // mostly white light
    }
    int nOn = (g_shape < 0.33) ? 2 : 3;

    float tWall = (rd.x > 0.0) ? (XW - ro.x) / rd.x : 1e9;
    float tFloor = (rd.y < 0.0) ? -ro.y / rd.y : 1e9;
    float tEnd = min(tWall, tFloor);

    vec3 acc = vec3(0.0);
    for (int j = 0; j < 3; ++j)
    {
        if (j >= nOn) break;
        Shape sh = shapeOf(j);
        vec4 h = sheetHits(ro, rd, P[j], sh, tEnd);
        float lvl = 0.3 + 1.2 * bands[j];
        for (int k = 0; k < 2; ++k)
        {
            vec2 hk = (k == 0) ? h.xy : h.zw;
            if (hk.x <= 0.0) continue;
            vec3 x = ro + rd * hk.x;
            float dens = 0.45 + 0.55 * noise3(x * 0.45 + vec3(0.0, -sceneTime * 0.04, sceneTime * 0.02));
            acc += beamCol[j] * min(hk.y, 12.0) * dens * haze * lvl * 0.11 * exp(-hk.x * 0.03);
        }
    }

    // Faint general scatter: the haze itself glows a little around the lenses.
    vec3 col = vec3(0.004, 0.004, 0.007);
    for (int j = 0; j < 3; ++j)
    {
        if (j >= nOn) break;
        vec3 dirL = normalize(P[j] - ro);
        float ang = acos(clamp(dot(rd, dirL), -1.0, 1.0));
        col += beamCol[j] * exp(-ang * 5.0) * 0.05 * haze;
    }
    if (tWall < tFloor)
    {
        vec3 wp = ro + rd * tWall;
        vec3 wallC = img(fract(wp.yz * 0.07)) * 0.015;
        for (int j = 0; j < 3; ++j)
        {
            if (j >= nOn) break;
            float d = wallDist(shapeOf(j), wp.yz);
            wallC += beamCol[j] * exp(-d * d / 0.0015) * (0.6 + 1.2 * bands[j]);
        }
        col += wallC * exp(-tWall * 0.02);
    }
    else if (tFloor < 1e8)
    {
        vec3 fp = ro + rd * tFloor;
        col += img(fract(fp.xz * 0.08)) * 0.02 * exp(-tFloor * 0.1);
    }
    col += acc;

    // The lenses: small hot points with a soft flare on the kick.
    for (int j = 0; j < 3; ++j)
    {
        if (j >= nOn) break;
        vec3 dirL = normalize(P[j] - ro);
        float ang = acos(clamp(dot(rd, dirL), -1.0, 1.0));
        float flare = exp(-ang * 300.0) * 3.0 + exp(-ang * 45.0) * (0.2 + 0.4 * clamp(audioKick, 0.0, 2.0));
        col += beamCol[j] * flare * (0.5 + bands[j]);
    }
    col *= 0.9 + 0.2 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
