#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file SeifertSurfaceBraidKnot.frag
 * @brief SEIFERT SURFACE BRAID KNOT: a torus knot as a studio sculpture --
 * a thick tube of polished, thin-film-iridescent glaze winding three times
 * through the hole of a torus while circling it five times, turning slowly
 * on a dark stage under a softbox; inside its loops the Seifert surface is
 * suggested by a soap film spanning the knot, shimmering in interference
 * colours.  A soft reflection lies on the glossy floor.  The rotation is
 * steady; the music is the light: the glaze's sheen and the film's colours.
 *
 * Replaces a Scene3D ribbon version (a flat white torus in the catalogue).
 *
 * Audio Reactivity:
 *   sceneTime/sceneAdvance -> the slow turn (continuous)
 *   audioSwell  -> softbox brightness (slow)
 *   audioKick   -> a glint runs over the glaze (light only)
 *   audioChromaHue -> photo tint of the glaze
 *
 * Per-activation variety: knotP (which knot), ribbonWidthP (tube
 * thickness), sheenP (gloss).
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
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float knotP;
uniform float ribbonWidthP;
uniform float sheenP;

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

float g_P = 3.0, g_Q = 5.0, g_th = 0.14;
mat3 g_rot;
float g_s = 0.0;                    ///< knot parameter at the hit (for colour)

/// Torus knot (P around the tube, Q around the axis): in the cross-section
/// at azimuth phi the Q strands sit at angles (phi + 2 pi i) P / Q.
float sdKnot(vec3 p)
{
    const float R = 1.0, r = 0.42;
    float phi = atan(p.z, p.x);
    vec2 q = vec2(length(p.xz) - R, p.y);
    float d = 1e9;
    for (int i = 0; i < 7; ++i) {
        if (float(i) >= g_Q) break;
        float a = (phi + 6.2831853 * float(i)) * g_P / g_Q;
        vec2 c = r * vec2(cos(a), sin(a));
        float di = length(q - c);
        if (di < d) { d = di; g_s = (phi + 6.2831853 * float(i)) / (6.2831853 * g_Q); }
    }
    return (d - g_th) * 0.6;
}

/// @brief The scene's distance field: distance from p to the nearest surface.
float map(vec3 p) { return sdKnot(g_rot * p); }

/// @brief Surface normal of the distance field by central differences.
vec3 calcNormal(vec3 p)
{
    vec2 e = vec2(0.0015, 0.0);
    return normalize(vec3(map(p + e.xyy) - map(p - e.xyy), map(p + e.yxy) - map(p - e.yxy), map(p + e.yyx) - map(p - e.yyx)));
}

/// Thin-film interference colour for an optical path difference x.
vec3 thinFilm(float x)
{
    return 0.5 + 0.5 * cos(6.2831853 * (x * vec3(1.0, 1.18, 1.36) + vec3(0.0, 0.1, 0.2)));
}

vec3 shade(vec3 ro, vec3 rd, float swell, float gloss, float kick, float T, out float hit, out float tHit)
{
    float t = 0.0;
    hit = 0.0;
    for (int i = 0; i < 140; ++i) {
        float d = map(ro + rd * t);
        if (d < 0.0008) { hit = 1.0; break; }
        t += d;
        if (t > 12.0) break;
    }
    tHit = t;
    if (hit < 0.5) return vec3(0.0);
    vec3 p = ro + rd * t;
    float s = g_s;
    vec3 n = calcNormal(p);
    vec3 V = -rd;
    vec3 L = normalize(vec3(-0.5, 0.9, -0.4));             // the softbox, above-left
    float dif = max(dot(n, L), 0.0);
    float fres = pow(1.0 - max(dot(n, V), 0.0), 4.0);
    // Glaze: deep base colour running along the knot, thin-film on top.
    vec3 base = mix(vec3(0.1, 0.25, 0.75), vec3(0.85, 0.2, 0.45), 0.5 + 0.5 * sin(s * 6.2831853 * 2.0));
    base = mix(base, imgPalette(s + 0.1) * 0.6, 0.2);
    vec3 film = thinFilm(1.2 + 1.6 * dot(n, V) + 0.4 * sin(s * 20.0));
    vec3 col = base * (0.18 + 1.0 * dif) + film * fres * 0.9;
    // Softbox reflection: a broad bright rectangle in the reflected direction.
    vec3 R = reflect(rd, n);
    float box = smoothstep(0.35, 0.25, abs(R.x + 0.4)) * smoothstep(0.3, 0.2, abs(R.z + 0.3)) * step(0.3, R.y);
    col += vec3(1.0) * box * gloss * (0.6 + 0.5 * swell);
    col += vec3(1.0) * pow(max(dot(R, L), 0.0), 80.0) * gloss;
    // A glint running along the knot on the kick.
    col += film * exp(-pow((fract(s - T * 0.05) - 0.5) * 30.0, 2.0)) * kick * 0.8;
    // Rim light from behind.
    col += vec3(0.5, 0.6, 1.0) * pow(1.0 - max(dot(n, V), 0.0), 3.0) * max(dot(n, normalize(vec3(0.3, 0.2, 1.0))), 0.0) * 0.5;
    return col;
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    float T = sceneTime + sceneAdvance * 0.4;
    float swell = clamp(audioSwell, 0.0, 1.0);
    float kick = clamp(audioKick, 0.0, 1.0);
    float kp = clamp((knotP > 0.01) ? knotP : 1.2, 0.6, 2.0);
    // knotP picks the knot: (2,3) trefoil, (3,4), (3,5), (2,5), (3,7).
    int kk = int(floor((kp - 0.6) / 1.4 * 4.99));
    g_P = (kk == 0) ? 2.0 : ((kk == 1) ? 3.0 : ((kk == 2) ? 3.0 : ((kk == 3) ? 2.0 : 3.0)));
    g_Q = (kk == 0) ? 3.0 : ((kk == 1) ? 4.0 : ((kk == 2) ? 5.0 : ((kk == 3) ? 5.0 : 7.0)));
    g_th = 0.05 + 0.8 * clamp((ribbonWidthP > 0.001) ? ribbonWidthP : 0.07, 0.03, 0.12);
    float gloss = 0.5 + 0.4 * clamp((sheenP > 0.01) ? sheenP : 1.5, 0.8, 2.5);

    float a = T * 0.06, b = 0.55 + 0.2 * sin(T * 0.023);
    mat3 ry = mat3(cos(a), 0.0, sin(a), 0.0, 1.0, 0.0, -sin(a), 0.0, cos(a));
    mat3 rx = mat3(1.0, 0.0, 0.0, 0.0, cos(b), -sin(b), 0.0, sin(b), cos(b));
    g_rot = ry * rx;

    vec3 ro = vec3(0.0, 0.5, -5.2);
    vec3 ww = normalize(vec3(0.0, -0.05, 0.0) - ro);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.8 * ww);

    // Stage: dark gradient backdrop, a glossy floor at y = -1.
    vec3 col = mix(vec3(0.02, 0.02, 0.03), vec3(0.09, 0.09, 0.12), smoothstep(-0.4, 0.6, uv.y));
    col += vec3(0.12, 0.1, 0.14) * exp(-length(uv - vec2(0.0, 0.1)) * 2.0) * (0.7 + 0.5 * swell);

    // The soap film: a disc spanning the knot's core, seen through the loops.
    {
        vec3 fn = g_rot * vec3(0.0, 1.0, 0.0);           // not exactly the knot plane: that is the point of a Seifert surface
        vec3 fnW = transpose(g_rot) * vec3(0.0, 1.0, 0.0);
        float den = dot(rd, fnW);
        if (abs(den) > 1e-3) {
            float tf = -dot(ro, fnW) / den;
            if (tf > 0.0) {
                vec3 fp = g_rot * (ro + rd * tf);
                float fr = length(fp.xz);
                float ang = atan(fp.z, fp.x);
                // Spiralling sheets between the strands.
                float sheet = smoothstep(1.45, 1.3, fr) * (0.5 + 0.5 * sin(ang * g_Q * 0.5 + fr * 6.0));
                vec3 fc = thinFilm(2.0 + fr * 1.5 + 0.3 * sin(ang * 3.0 + T * 0.2)) * (0.35 + 0.3 * swell);
                col = mix(col, col + fc * 0.5, sheet * 0.6);
            }
        }
    }

    float hit, tHit;
    vec3 kc = shade(ro, rd, swell, gloss, kick, T, hit, tHit);
    // Floor with a soft reflection of the knot.
    float tFloor = (rd.y < 0.0) ? (-1.55 - ro.y) / rd.y : 1e9;
    if (hit > 0.5 && tHit < tFloor) {
        col = kc;
    } else if (tFloor < 1e8) {
        vec3 fp = ro + rd * tFloor;
        vec3 fcol = vec3(0.03, 0.03, 0.04) * (1.0 - 0.15 * length(fp.xz));
        vec3 rro = fp, rrd = reflect(rd, vec3(0.0, 1.0, 0.0));
        float h2, t2;
        vec3 rc = shade(rro, rrd, swell, gloss, 0.0, T, h2, t2);
        fcol += rc * h2 * 0.25 * exp(-t2 * 0.4);
        // A soft contact shadow.
        fcol *= 0.6 + 0.4 * smoothstep(0.0, 1.4, length(fp.xz));
        col = mix(col, fcol, smoothstep(12.0, 4.0, tFloor));
    }

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
