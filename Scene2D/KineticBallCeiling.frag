#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file KineticBallCeiling.frag
 * @brief KINETIC BALL CEILING: a kinetic sculpture of hundreds of polished
 * metal balls, each hanging on its own thin wire from a dark ceiling, the
 * whole field together forming one slowly flowing surface -- a wave that
 * rolls through, folds into a saddle, flattens and rises again.  Seen from
 * below at the edge of the field; every ball mirrors the photograph and
 * catches the spot lights of the hall.  The camera is still; the waves
 * move with time only, the music is the light on the metal.
 *
 * The field is ray-traced through a grid walk (one ball per cell), the
 * balls anti-aliased by their analytic distance to the ray.
 *
 * Audio Reactivity:
 *   audioBass   -> the spot lights of the hall (light)
 *   audioHigh   -> glints on the balls (light)
 *   audioSwell  -> the warm glow under the ceiling (slow)
 *   audioLevel  -> brightness
 *   sceneTime / sceneAdvance -> the flowing surface (continuous)
 *
 * Per-activation variety: waveP (the shape of the waves), hueP.
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
uniform float audioHigh;   ///< High band level, 0..1.
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float waveP;   ///< Wave knob.
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

const float GRID  = 13.0;     ///< cells from the centre to the edge
const float BALLR = 0.27;
const float CEIL  = 11.0;

float gT, gW;

/// Height of the ball hanging in cell c: a slow superposition of waves.
float ballY(vec2 c)
{
    float a1 = 0.5 + 0.5 * sin(gT * 0.021 + gW * 3.0);
    float a2 = 1.0 - a1;
    float h = 1.1 * sin(c.x * 0.33 + c.y * 0.18 + gT * 0.16)
            + 0.8 * a1 * sin(length(c - vec2(3.0, 2.0)) * (0.35 + 0.2 * gW) - gT * 0.12)
            + 0.9 * a2 * sin(c.x * 0.22 + gT * 0.09) * sin(c.y * 0.25 - gT * 0.07 + gW * 5.0);
    return 6.0 + h;
}

/// The photo as the hall around the balls, seen in their mirrors.
vec3 envir(vec3 R)
{
    // Mirrored around the view axis, so the wrap of the angle leaves no seam.
    vec2 euv = vec2(0.15 + 0.7 * abs(atan(R.x, R.z)) / 3.14159, 0.5 + 0.45 * R.y);
    vec3 e = img(clamp(euv, 0.0, 1.0));
    float g = dot(e, vec3(0.333));
    e = mix(vec3(g), e, 0.6);
    // Below the horizon the lit floor of the hall, above it the dark
    // ceiling: the sharp line between them is what reads as chrome.
    float floorSide = smoothstep(0.03, -0.03, R.y);
    return mix(e * 0.18 + vec3(0.02), e * 1.1 + 0.08, floorSide);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float bass = clamp(audioBass, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    gT = sceneTime + sceneAdvance * 0.4;
    gW = clamp(waveP, 0.0, 1.0);

    // Standing at the edge of the field, looking in and up.
    vec3 ro = vec3(0.0, 1.7, -GRID - 5.0);
    vec3 fw = normalize(vec3(0.0, 0.42, 1.0));
    vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
    vec3 up = cross(fw, rt);
    vec3 rd = normalize(p.x * rt + p.y * up + 1.25 * fw);
    float pxK = 1.6 / (resolution.y * 1.25);                    // pixel footprint per unit distance

    vec3 key = normalize(vec3(-0.6, -0.5, 0.6));                 // spot lights shine down into the field
    vec3 key2 = normalize(vec3(0.7, -0.3, -0.2));

    // Background: the dark hall, a warm glow under the ceiling, the floor.
    vec3 bg;
    if (rd.y > 0.0) {
        float tc = (CEIL - ro.y) / rd.y;
        vec2 cq = (ro + rd * tc).xz;
        // Downlights in the ceiling panels.
        vec2 lq = cq / 4.0, lf = fract(lq) - 0.5;
        float dl = smoothstep(0.08, 0.03, length(lf)) * smoothstep(90.0, 20.0, tc);
        bg = vec3(0.03, 0.028, 0.03) + vec3(1.0, 0.8, 0.55) * (0.04 + 0.08 * swell) * exp(-tc * 0.02);
        bg += vec3(1.0, 0.9, 0.75) * dl * (0.4 + 0.6 * bass);
    } else {
        float tf = -ro.y / rd.y;
        bg = vec3(0.05, 0.045, 0.04) * exp(-tf * 0.03) + vec3(0.02);
    }

    vec3 acc = vec3(0.0);
    float alpha = 0.0;
    if (rd.y > 0.0) {
        // The slab of the field: from just under the lowest balls to the ceiling.
        float tA = max((3.4 - ro.y) / rd.y, 0.0);
        float tB = (CEIL - ro.y) / rd.y;
        // Clip to the grid's footprint in x/z.
        vec2 ro2 = ro.xz, rd2 = rd.xz;
        vec2 inv = 1.0 / (rd2 + 1e-6 * sign(rd2) + vec2(1e-7));
        vec2 t1 = (vec2(-GRID - 0.5) - ro2) * inv, t2 = (vec2(GRID + 0.5) - ro2) * inv;
        vec2 tmin = min(t1, t2), tmax = max(t1, t2);
        tA = max(tA, max(tmin.x, tmin.y));
        tB = min(tB, min(tmax.x, tmax.y));
        if (tA < tB) {
            // Grid walk over the cells the ray crosses.
            vec2 pos = ro2 + rd2 * tA;
            vec2 cell = floor(pos + 0.5);
            vec2 stp = sign(rd2);
            vec2 tDelta = abs(inv);
            vec2 tNext = ((cell + 0.5 * stp) - ro2) * inv;
            for (int k = 0; k < 90; ++k) {
                float tc = min(tNext.x, tNext.y);
                if (abs(cell.x) <= GRID && abs(cell.y) <= GRID) {
                    float by = ballY(cell);
                    vec3 C = vec3(cell.x, by, cell.y);
                    float px = pxK * dot(C - ro, rd);
                    // Ball: nearest approach of the ray to the centre.
                    float tb = dot(C - ro, rd);
                    vec3 cp = ro + rd * tb - C;
                    float dmin = length(cp);
                    float cov = smoothstep(BALLR + px, BALLR - px, dmin);
                    // The wire above the ball: nearest approach in x/z.
                    vec2 w = cell - ro2;
                    float tw = dot(w, rd2) / dot(rd2, rd2);
                    float yw = ro.y + rd.y * tw;
                    float dw = length(ro2 + rd2 * tw - cell);
                    float pw = pxK * tw;
                    float wcov = smoothstep(max(pw, 0.012) * 1.2, 0.0, dw) * min(0.012 / max(pw, 0.012), 1.0) * 0.8
                               * step(by + BALLR * 0.8, yw) * step(yw, CEIL);
                    vec3 wcol = vec3(0.35, 0.33, 0.3) * (0.3 + 0.7 * bass) * 0.5;
                    // Order the wire and the ball by distance along the ray.
                    if (wcov > 0.0 && tw < tb) { acc += (1.0 - alpha) * wcov * wcol; alpha += (1.0 - alpha) * wcov; }
                    if (cov > 0.0) {
                        // Surface point (or the rim point for an edge pixel).
                        float hh = sqrt(max(BALLR * BALLR - dmin * dmin, 0.0));
                        vec3 P = ro + rd * (tb - hh) - C;
                        vec3 n = normalize(dmin < BALLR ? P : cp);
                        vec3 R = reflect(rd, n);
                        float fr = 0.65 + 0.35 * pow(1.0 - max(dot(-rd, n), 0.0), 3.0);
                        vec3 sc = envir(R) * fr * vec3(0.9, 0.92, 0.95);
                        sc = mix(sc, sc * imgPalette(0.3 + hueP * 0.159) * 1.5, 0.12);
                        // Spot lights mirrored as hot points; glints with the highs.
                        sc += vec3(1.0, 0.92, 0.8) * pow(max(dot(R, -key), 0.0), 90.0) * (1.2 + 2.0 * bass);
                        sc += vec3(0.8, 0.9, 1.0) * pow(max(dot(R, -key2), 0.0), 200.0) * (0.3 + 2.5 * hi);
                        // Depth: far balls fade into the dark hall.
                        sc = mix(sc, bg, smoothstep(12.0, 45.0, tb) * 0.6);
                        acc += (1.0 - alpha) * cov * sc;
                        alpha += (1.0 - alpha) * cov;
                    }
                    if (wcov > 0.0 && tw >= tb) { acc += (1.0 - alpha) * wcov * wcol; alpha += (1.0 - alpha) * wcov; }
                    if (alpha > 0.995) break;
                }
                if (tc > tB) break;
                if (tNext.x < tNext.y) { tNext.x += tDelta.x; cell.x += stp.x; }
                else                   { tNext.y += tDelta.y; cell.y += stp.y; }
            }
        }
    }
    vec3 col = acc + (1.0 - alpha) * bg;

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
