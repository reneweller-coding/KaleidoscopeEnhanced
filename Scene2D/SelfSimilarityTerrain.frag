#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file SelfSimilarityTerrain.frag
 * @brief SELF SIMILARITY TERRAIN: the song's self-similarity matrix as a
 * moonlit mountain range.  Where the music repeats itself the land rises
 * into snowy ridges -- the diagonal, "now against now", is the main range
 * running away from the camera -- and where it is new the land falls into
 * valleys with a still lake in them that mirrors the moon.  Under a starry
 * sky and a large moon the snow glows blue-white, mist lies in the low
 * ground, and as the song goes on the ranges flow slowly toward the viewer
 * (the matrix scrolls with time).  A natural fractal relief underneath
 * keeps the land alive before the matrix has filled.
 *
 * Replaces a Scene3D tessellated version (a grey slab in the catalogue).
 *
 * Audio Reactivity:
 *   texSSM / ssmHead / ssmFill -> the ranges
 *   audioSwell -> moonlight (slow)
 *   audioKick  -> the nearest ridge lights (light)
 *   audioBass  -> warm light in the valleys (light)
 *   audioHigh  -> glints on the snow (light)
 *   audioLevel -> brightness
 *
 * Per-activation variety: camHP (camera height), detailP, heightP, hueP.
 */

uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.
uniform sampler2D texSSM;
uniform float ssmHead;
uniform float ssmFill;

uniform float sceneTime;   ///< Seconds since this scene was activated.
uniform float sceneAdvance;   ///< The music's advance since this scene was activated (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioBass;   ///< Bass band level, 0..1.
uniform float audioHigh;   ///< High band level, 0..1.
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float camHP;   ///< Camera height knob, 0..1.
uniform float detailP;   ///< Detail knob, 0..1.
uniform float heightP;   ///< Height knob, 0..1.
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
    vec2 i = floor(p), f = fract(p); f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}

float g_hs = 1.0, g_det = 1.0;

/// Similarity at terrain position (x across, z away): both axes read back
/// from the ring head, so the land flows toward the viewer as time runs.
float sim(vec2 w)
{
    vec2 uv = vec2(w.x / 40.0 + 0.5, w.y / 60.0);
    if (uv.y < 0.0 || uv.y > 1.0 || uv.x < 0.0 || uv.x > 1.0) return 0.0;
    float span = 0.9 * max(ssmFill, 0.08);
    vec2 ages = vec2((1.0 - uv.x) * span, uv.y * span);
    return texture(texSSM, fract(vec2(ssmHead) - ages)).r;
}

float terrain(vec2 w, int oct)
{
    // Natural relief: ridged fractal noise.
    float h = 0.0, a = 0.5;
    vec2 q = w * 0.07;
    for (int i = 0; i < 6; ++i) {
        if (i >= oct) break;
        float n = 1.0 - abs(2.0 * noise2(q) - 1.0);
        h += a * n * n;
        q = mat2(1.6, 1.2, -1.2, 1.6) * q + 1.3;
        a *= 0.5;
    }
    float s = sim(w);
    // The matrix raises ranges only beyond the foreground (fades in with
    // distance), so the camera never ends up inside a wall of it.
    float ht = h * 7.0 * g_det + s * s * 6.0 * g_hs * smoothstep(6.0, 20.0, w.y);
    // The far end rises into a wall of peaks so the horizon is filled.
    ht += smoothstep(40.0, 70.0, w.y) * 9.0 * h;
    return ht;
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    float hue = (hueP > 0.001) ? hueP : 0.0;
    float swell = clamp(audioSwell, 0.0, 1.0);
    float T = sceneTime + sceneAdvance * 0.5;
    g_hs = clamp((heightP > 0.05) ? heightP : 1.0, 0.8, 1.3);
    g_det = clamp((detailP > 0.05) ? detailP : 1.0, 0.8, 1.2);
    float camH = clamp((camHP > 0.1) ? camHP : 7.0, 5.0, 9.0);

    vec3 ro = vec3(2.0 * sin(T * 0.01), camH + 7.0, -6.0);
    vec3 ta = vec3(0.0, 7.5, 30.0);
    vec3 ww = normalize(ta - ro);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.5 * ww);

    vec3 moonDir = normalize(vec3(-0.42, 0.21, 1.0));      // low, in view
    vec3 moonL = normalize(vec3(-0.5, 0.45, 0.8));        // its light, a little higher for modelling
    vec3 moonC = mix(vec3(0.75, 0.85, 1.0), imgPalette(0.6 + hue * 0.159), 0.12) * (0.8 + 0.4 * swell);

    // Night sky: deep blue, stars (round), the moon with a halo.
    vec3 col = mix(vec3(0.03, 0.05, 0.1), vec3(0.08, 0.12, 0.22), smoothstep(0.4, -0.05, rd.y));
    {
        vec3 sd = rd * 260.0;
        vec3 si = floor(sd), sf = fract(sd) - 0.5;
        float st = hash21(si.xy + si.z * 7.3);
        col += vec3(0.85, 0.9, 1.0) * smoothstep(0.14, 0.0, length(sf)) * step(0.992, st) * smoothstep(0.0, 0.15, rd.y);
    }
    float md = acos(clamp(dot(rd, moonDir), -1.0, 1.0));
    col += moonC * smoothstep(0.024, 0.021, md) * 1.8;
    col += moonC * exp(-md * 10.0) * 0.3;

    // March the terrain.
    float t = 1.0, hit = 0.0;
    vec3 p = ro;
    float lake = 2.2;
    for (int i = 0; i < 150; ++i) {
        p = ro + rd * t;
        float h = max(terrain(p.xz, 4), lake);
        float dh = p.y - h;
        if (dh < 0.002 * t) { hit = 1.0; break; }
        t += dh * 0.45;
        if (t > 140.0) break;
    }

    if (hit > 0.5) {
        float hT = terrain(p.xz, 6);
        vec3 c;
        if (hT < lake) {
            // The lake mirrors the sky and the moon.
            vec3 R = reflect(rd, vec3(0.0, 1.0, 0.0));
            float rm = acos(clamp(dot(R, moonDir), -1.0, 1.0));
            c = vec3(0.02, 0.04, 0.08) + moonC * (smoothstep(0.03, 0.02, rm) * 1.0 + exp(-rm * 8.0) * 0.25);
            c += moonC * 0.06 * (0.5 + 0.5 * sin(p.x * 3.0 + p.z * 1.7 + T));
        } else {
            vec2 e = vec2(0.08 + 0.004 * t, 0.0);
            vec3 n = normalize(vec3(terrain(p.xz - e.xy, 6) - terrain(p.xz + e.xy, 6), 2.0 * e.x,
                                    terrain(p.xz - e.yx, 6) - terrain(p.xz + e.yx, 6)));
            float dif = max(dot(n, moonL), 0.0);
            float sN = smoothstep(2.2, 4.2, hT + 3.0 * (n.y - 0.7));
            vec3 rock = vec3(0.12, 0.12, 0.14);
            vec3 snow = vec3(0.85, 0.9, 1.0);
            vec3 alb = mix(rock, snow, sN * smoothstep(0.45, 0.7, n.y));
            c = alb * (moonC * dif * 2.0 + vec3(0.08, 0.1, 0.17));
            // Snow glints.
            // Round glints on the snow (jittered points, not grid cells).
            vec2 gg = p.xz * 40.0, gi = floor(gg), gf = fract(gg);
            vec2 gc = 0.25 + 0.5 * vec2(hash21(gi + 1.3), hash21(gi + 4.7));
            float glint = smoothstep(0.2, 0.0, length(gf - gc)) * step(0.97, hash21(gi));
            c += vec3(1.0) * glint * sN * (0.2 + 0.8 * clamp(audioHigh * 2.0, 0.0, 1.0)) * dif;
            // Warm valley light (a village?) with the bass.
            c += vec3(1.0, 0.6, 0.3) * smoothstep(3.5, 2.3, hT) * 0.05 * clamp(audioBass, 0.0, 1.0);
            // The nearest ridge on the kick.
            c += moonC * sN * exp(-t * 0.08) * clamp(audioKick, 0.0, 1.0) * 0.3;
        }
        // Night haze and low mist.
        float fog = 1.0 - exp(-t * 0.018);
        c = mix(c, vec3(0.1, 0.14, 0.25), fog);
        float mist = smoothstep(4.0, 2.3, p.y) * smoothstep(0.4, 0.8, noise2(p.xz * 0.15 + vec2(T * 0.02, 0.0)));
        c = mix(c, moonC * 0.35, mist * 0.6);
        col = c;
    }

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(pow(_catTone, vec3(0.9)), 0.0, 1.0), 1.0);
}
