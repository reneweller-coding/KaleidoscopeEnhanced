#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file SagradaForestNave.frag
 * @brief SAGRADA FOREST NAVE: a church nave built as a stone forest, after
 * Gaudi -- slender columns rise like trunks and branch high up into a
 * canopy that carries the vault, whose cells open into bright star-like
 * skylights.  Down both sides run tall stained-glass windows, cool blues
 * and greens on the one side, fiery reds, oranges and yellows on the
 * other, and the low sun from the warm side sends coloured shafts through
 * the haze that fall across the floor as pools of coloured light.  At the
 * end of the nave a rose window glows.  The camera is still.
 *
 * Each window colour answers one band of the spectrum: when the band
 * sounds, those windows and their shafts burn brighter.
 *
 * Audio Reactivity:
 *   audioSpectrum[32] -> the four window families (light)
 *   audioSwell        -> the haze in the shafts (slow)
 *   audioLevel        -> brightness
 *   sceneTime / sceneAdvance -> the sun creeping, the haze drifting
 *
 * Per-activation variety: branchP (how the columns branch), hueP.
 */

uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float sceneTime;   ///< Seconds since this scene was activated.
uniform float sceneAdvance;   ///< The music's advance since this scene was activated (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioSpectrum[32];   ///< Spectrum bands, 0..1.
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float branchP;   ///< Branching knob, 0..1.
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
/// @brief Distance from a point to a line segment.
float sdSeg(vec2 p, vec2 a, vec2 b)
{
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h);
}

// The nave (metres, eye at the origin): floor, vault, side walls, columns.
const float FL = -1.6, VAULT = 5.0, HALFW = 2.4, COLX = 1.5, ZEND = 16.0;
const float Z0 = 2.2, DZ = 1.7;          // column depths
const float F = 0.95;                     ///< focal length
const float VY = -0.16;                   ///< horizon on screen (looking up)
float gE[4];                              ///< band energies of the window families
vec3 gSun;                                ///< direction the sunlight travels

/// A window family's glass colour (0 blue, 1 green, 2 yellow-orange, 3 red).
vec3 famCol(int f)
{
    vec3 c = (f == 0) ? vec3(0.15, 0.35, 1.0) : (f == 1) ? vec3(0.2, 0.85, 0.45)
           : (f == 2) ? vec3(1.0, 0.65, 0.12) : vec3(1.0, 0.18, 0.1);
    return c;
}

/// Stained glass on a side wall at (Z, Y): which family, the glass colour
/// with its leading, and 0 outside the windows.
vec3 glass(float Z, float Y, bool warm, out float inside)
{
    inside = 0.0;
    float bay = floor((Z - Z0) / DZ);
    if (bay < 0.0 || Z > ZEND - 0.5) return vec3(0.0);
    float zc = Z0 + (bay + 0.5) * DZ;
    vec2 q = vec2(Z - zc, Y - 1.2);
    // A tall lancet with a pointed arch.
    float w = DZ * 0.3;
    float body = max(abs(q.x) - w, abs(q.y) - 1.4);
    vec2 aq = vec2(abs(q.x), q.y - 1.4);
    float arch = max(length(aq - vec2(-w, 0.0)) - 2.0 * w, -aq.y);
    float d = min(body, arch);
    if (d > 0.0) return vec3(0.0);
    inside = 1.0;
    int fam = warm ? 2 + int(mod(bay, 2.0)) : int(mod(bay, 2.0));
    // Glass cells between lead cames (cells jittered, colours varied).
    vec2 g = vec2(q.x * 7.0, q.y * 5.0);
    vec2 gi = floor(g), gf = fract(g);
    float md = 9.0, md2 = 9.0; vec2 mid = vec2(0.0);
    for (int j = -1; j <= 1; ++j)
    for (int i = -1; i <= 1; ++i) {
        vec2 o = vec2(i, j);
        vec2 c = o + 0.2 + 0.6 * vec2(hash21(gi + o + bay * 7.0), hash21(gi + o + bay * 7.0 + 3.0));
        float dd = length(gf - c);
        if (dd < md) { md2 = md; md = dd; mid = gi + o; }
        else if (dd < md2) md2 = dd;
    }
    float lead = smoothstep(0.04, 0.09, md2 - md) * smoothstep(0.0, 0.03, -d);
    vec3 base = famCol(fam);
    float hv = hash21(mid + bay * 3.0);
    vec3 c = mix(base, base.gbr * 0.7 + 0.3 * base, 0.25 * hv) * (0.7 + 0.5 * hash21(mid + 11.0));
    c = mix(c, imgPalette(hv * 0.3 + hueP * 0.159) * 1.2, 0.12);
    inside = lead;
    return c * lead * (0.35 + 1.4 * gE[fam]);
}

/// Light arriving at a point from the sun through the warm (right) windows:
/// the window's colour with soft edges (the sun is no point), no leading.
vec3 sunThrough(vec3 P)
{
    // Walk back against the light to the right wall.
    float t = (HALFW - P.x) / (-gSun.x);
    if (t < 0.0) return vec3(0.0);
    vec3 W = P - gSun * t;
    float bay = floor((W.z - Z0) / DZ);
    if (bay < 0.0 || W.z > ZEND - 0.5) return vec3(0.0);
    float zc = Z0 + (bay + 0.5) * DZ;
    vec2 q = vec2(W.z - zc, W.y - 1.2);
    float w = DZ * 0.3;
    float body = max(abs(q.x) - w, abs(q.y) - 1.4);
    vec2 aq = vec2(abs(q.x), q.y - 1.4);
    float arch = max(length(aq - vec2(-w, 0.0)) - 2.0 * w, -aq.y);
    float d = min(body, arch);
    float pen = 0.08 + 0.08 * t;                                  // penumbra grows with distance
    float m = smoothstep(pen, -pen, d);
    if (m <= 0.0) return vec3(0.0);
    int fam = 2 + int(mod(bay, 2.0));
    vec3 c = famCol(fam) * (0.8 + 0.3 * noise2(q * 3.0 + bay));
    return c * m * (0.35 + 1.4 * gE[fam]);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float T = sceneTime + sceneAdvance * 0.4;
    float px = 1.0 / resolution.y;

    // Band energies of the four window families (low .. high).
    gE[0] = 0.0; gE[1] = 0.0; gE[2] = 0.0; gE[3] = 0.0;
    for (int i = 0; i < 32; ++i) {
        int f = (i < 4) ? 3 : (i < 10) ? 2 : (i < 18) ? 1 : 0;
        gE[f] += audioSpectrum[i];
    }
    gE[3] = clamp(gE[3] / 4.0 * 1.5, 0.0, 1.0);
    gE[2] = clamp(gE[2] / 6.0 * 1.8, 0.0, 1.0);
    gE[1] = clamp(gE[1] / 8.0 * 2.2, 0.0, 1.0);
    gE[0] = clamp(gE[0] / 14.0 * 3.0, 0.0, 1.0);

    // The low sun from the warm side, creeping slowly.
    gSun = normalize(vec3(-1.0, -0.55 - 0.1 * sin(T * 0.01), 0.35 * sin(T * 0.013)));

    // The view ray and the nave's surfaces.
    vec3 rd = normalize(vec3(p.x, p.y - VY, F));
    float tHit = 1e9; int mat = 0;
    if (rd.y > 0.0) { float t = VAULT / rd.y; if (t < tHit) { tHit = t; mat = 1; } }
    if (rd.y < 0.0) { float t = FL / rd.y;    if (t < tHit) { tHit = t; mat = 2; } }
    { float t = HALFW / abs(rd.x); if (t < tHit) { tHit = t; mat = 3; } }
    { float t = ZEND / rd.z;       if (t < tHit) { tHit = t; mat = 4; } }
    vec3 P = rd * tHit;

    vec3 stone = vec3(0.78, 0.74, 0.68);
    vec3 amb = vec3(0.1, 0.1, 0.11);
    vec3 col;
    if (mat == 1) {
        // The vault: cells like the undersides of leaves, each opening into
        // a star-shaped skylight.
        vec2 cq = vec2(P.x / 1.2, (P.z - Z0) / DZ + 0.5);
        vec2 ci = floor(cq), cf = fract(cq) - 0.5;
        float r = length(cf);
        float ang = atan(cf.y, cf.x);
        float star = smoothstep(0.13 + 0.05 * cos(ang * 8.0), 0.08, r);
        float bowl = 0.5 + 0.5 * cos(r * 6.2831853);
        col = stone * (0.3 + 0.45 * bowl) + vec3(1.0, 0.97, 0.9) * star * 1.8;
        col += vec3(1.0, 0.9, 0.7) * 0.15 * smoothstep(0.3, 0.1, r);
        col *= exp(-tHit * 0.04);
    } else if (mat == 3) {
        bool warm = P.x > 0.0;
        float ins;
        vec3 g = glass(P.z, P.y, warm, ins);
        col = stone * amb * 1.4 + g * (warm ? 1.3 : 0.9);
    } else if (mat == 4) {
        // The apse wall and its rose window.
        vec2 rq = vec2(P.x, P.y - 2.3);
        float rr = length(rq);
        float ra = atan(rq.y, rq.x);
        float spokes = smoothstep(0.1, 0.25, abs(fract(ra / 6.2831853 * 16.0) - 0.5));
        float rings = smoothstep(0.03, 0.06, abs(fract(rr * 3.0) - 0.5));
        float inRose = smoothstep(1.25, 1.2, rr);
        vec3 rc = mix(famCol(0), famCol(3), 0.5 + 0.5 * sin(ra * 3.0 + rr * 4.0));
        rc = mix(rc, famCol(2), smoothstep(0.35, 0.0, rr));
        float eR = 0.25 * (gE[0] + gE[1] + gE[2] + gE[3]);
        col = stone * amb + rc * spokes * rings * inRose * (0.6 + 1.2 * eR);
    } else {
        // The floor: polished stone, pools of coloured light where the
        // shafts land.
        float tile = 0.9 + 0.1 * noise2(P.xz * 3.0);
        col = stone * amb * tile + stone * sunThrough(P) * 1.5 * tile;
    }
    col *= exp(-tHit * 0.02);

    // The columns: trunks rising and branching into the vault, drawn in
    // screen space from far to near.
    float colT = 1e9;
    float br = 0.3 + 0.4 * clamp(branchP, 0.0, 1.0);
    for (int k = 7; k >= 0; --k) {
        float z = Z0 + DZ * float(k);
        if (z > tHit) continue;
        for (int sgn = 0; sgn < 2; ++sgn) {
            float sx = sgn == 0 ? -1.0 : 1.0;
            // The world point in this column's plane.
            vec2 w = vec2(p.x, p.y - VY) * z / F;
            vec2 cq = vec2(w.x - sx * COLX, w.y);
            float bh = 2.6;                                          // where the trunk branches
            float d = max(abs(cq.x) - (0.13 - 0.02 * smoothstep(FL, bh, cq.y)), -(cq.y - FL));
            d = max(d, cq.y - bh - 0.1);
            // Branches: two orders of arms spreading into the vault.
            vec2 b0 = vec2(0.0, bh);
            vec2 e1 = vec2(-sx * (0.6 + br), bh + 1.3), e2 = vec2(sx * 0.4, bh + 1.4), e3 = vec2(-sx * 0.1, bh + 1.6);
            d = min(d, sdSeg(cq, b0, e1) - 0.08);
            d = min(d, sdSeg(cq, b0, e2) - 0.075);
            d = min(d, sdSeg(cq, b0, e3) - 0.085);
            d = min(d, sdSeg(cq, e1, e1 + vec2(-sx * 0.3, VAULT - e1.y)) - 0.05);
            d = min(d, sdSeg(cq, e1, e1 + vec2(sx * 0.2, VAULT - e1.y)) - 0.05);
            d = min(d, sdSeg(cq, e2, e2 + vec2(sx * 0.3, VAULT - e2.y)) - 0.05);
            d = min(d, sdSeg(cq, e3, vec2(e3.x, VAULT)) - 0.06);
            // A knot where it branches.
            d = min(d, length((cq - b0) * vec2(1.0, 0.8)) - 0.2);
            float aa = px * z / F * 1.2;
            float cov = smoothstep(aa, -aa, d);
            if (cov > 0.0) {
                // Lit on the side facing the warm windows, coloured by them.
                float side = clamp(0.5 + 0.5 * cq.x / 0.13, 0.0, 1.0);
                vec3 lit = sunThrough(vec3(sx * COLX + cq.x, cq.y, z)) * 1.2;
                vec3 cc = stone * (amb * (0.8 + 0.6 * side) + lit * side);
                // Fluting on the trunk.
                cc *= 0.85 + 0.15 * cos(cq.x / 0.13 * 9.0) * step(cq.y, bh);
                // The branches up in the canopy catch the skylights.
                cc += stone * 0.16 * smoothstep(bh - 0.5, VAULT, cq.y);
                cc *= exp(-z * 0.02);
                col = mix(col, cc, cov);
                if (cov > 0.5) colT = z;
            }
        }
    }

    // The shafts of coloured light in the haze, integrated along the view
    // ray up to whatever it hits.
    float tEnd = min(tHit, colT);
    vec3 shaft = vec3(0.0);
    const int NS = 20;
    float jit = hash21(gl_FragCoord.xy + fract(T) * 13.0);
    for (int i = 0; i < NS; ++i) {
        float t = tEnd * (float(i) + jit) / float(NS);
        vec3 S = rd * t;
        float dens = 0.6 + 0.4 * noise2(S.xz * 0.8 + vec2(T * 0.03, S.y * 0.5));
        shaft += sunThrough(S) * dens;
    }
    shaft *= tEnd / float(NS) * 0.07 * (0.6 + 0.8 * swell);
    col += shaft;

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
