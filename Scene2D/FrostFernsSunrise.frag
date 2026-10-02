#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file FrostFernsSunrise.frag
 * @brief FROST FERNS SUNRISE: ice flowers on a window pane at dawn.  Feathery
 * frost ferns branch across the glass from its edges -- main stems, side
 * barbs, finer barbs again, each crystal catching the low sun -- and
 * through the clear patches between them glows the sunrise outside:
 * orange at the horizon, rose, then pale blue, a blurred row of snowy
 * roofs.  Where the sun stands behind the glass the frost lights up gold
 * and sparkles.  The frost grows almost imperceptibly; the music is the
 * light in the ice.
 *
 * Audio Reactivity:
 *   audioSwell  -> the sun's glow through the glass (slow)
 *   audioHigh   -> glints on the crystal edges (light)
 *   audioLevel  -> brightness
 *   sceneTime / sceneAdvance -> the slow growth and the sun's rise (continuous)
 *
 * Per-activation variety: frostP (how much of the pane is frozen), hueP.
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
uniform float audioHigh;   ///< High band level, 0..1.
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float frostP;
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

/// @brief Pseudo-random number 0..1 from a float.
float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
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
/// @brief Fractal noise: octaves of value noise.
float fbm(vec2 p)
{
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; ++i) { v += a * noise2(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 2.3; a *= 0.5; }
    return v;
}

/// One frost fern: a gently curved stem with barbs on both sides, the barbs
/// carrying finer barbs.  Local frame: stem along +x from the origin.
/// Returns the crystal density (0..1).
float fern(vec2 q, float len, float seed)
{
    if (q.x < -0.01 || q.x > len + 0.02) return 0.0;
    float bend = 0.18 * sin(seed * 6.0) * q.x * q.x / len;
    float y = q.y - bend;
    float stem = exp(-y * y / (0.00004 + 0.00002 * (1.0 - q.x / len)));
    // Barbs: at a regular spacing, angled forward, shorter toward the tip.
    float sp = 0.022 + 0.008 * hash11(seed);
    float bx = q.x - floor(q.x / sp) * sp;                        // distance past the last barb root
    float side = sign(y);
    float taper = 1.0 - q.x / len;
    float blen = 0.07 * taper + 0.01;
    // Along the barb: it leaves at ~50 degrees.
    vec2 bd = vec2(bx, abs(y));
    vec2 bdir = normalize(vec2(0.65, 0.76));
    float along = dot(bd, bdir), across = dot(bd, vec2(-bdir.y, bdir.x));
    float barb = exp(-across * across / 0.000012) * step(0.0, along) * step(along, blen);
    // Finer barbs off each barb.
    float sp2 = 0.007;
    float fx = along - floor(along / sp2) * sp2;
    vec2 fd = vec2(fx, abs(across));
    vec2 fdir = normalize(vec2(0.6, 0.8));
    float fa = dot(fd, fdir), fc = dot(fd, vec2(-fdir.y, fdir.x));
    float fine = exp(-fc * fc / 0.000004) * step(0.0, fa) * step(fa, 0.018 * (1.0 - along / max(blen, 1e-3))) * step(along, blen) * step(abs(across), 0.02);
    return clamp(stem + barb * 0.9 + fine * 0.6, 0.0, 1.0);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float T = sceneTime + sceneAdvance * 0.4;
    float frost = 0.5 + 0.5 * clamp(frostP, 0.0, 1.0);

    // Outside, blurred through the glass: dawn sky and snowy roofs.
    vec2 sun = vec2(0.25, -0.12 + 0.004 * T * 0.2);
    float hy = -0.18;
    vec3 sky = mix(vec3(1.0, 0.55, 0.25), vec3(0.95, 0.6, 0.6), smoothstep(hy, hy + 0.15, p.y));
    sky = mix(sky, vec3(0.55, 0.7, 0.9), smoothstep(hy + 0.1, 0.5, p.y));
    float sd = length(p - sun);
    sky += vec3(1.0, 0.75, 0.4) * exp(-sd * 3.5) * (0.6 + 0.5 * swell) + vec3(1.0, 0.95, 0.8) * exp(-sd * sd * 400.0) * 1.5;
    float roofs = hy + 0.03 * smoothstep(0.2, 0.8, noise2(vec2(p.x * 4.0, 2.0)));
    roofs += 0.03 * noise2(vec2(p.x * 6.0, 1.0));
    vec3 outside = mix(sky, mix(vec3(0.75, 0.72, 0.8), vec3(0.3, 0.3, 0.45), smoothstep(roofs, roofs - 0.3, p.y)), smoothstep(roofs + 0.01, roofs - 0.01, p.y));
    outside = mix(outside, outside * imgPalette(0.08 + hueP * 0.159) * 1.4, 0.1);

    // The frost: ferns seeded all over the pane on a jittered lattice,
    // each at its own angle; the pane freezes from the edges, so the
    // ferns are longer and denser there and a clear window stays in the
    // middle where the warmth of the room keeps the glass clear.
    vec2 ed0 = vec2(0.5 * aspect, 0.5) - abs(p);
    float edgeD = min(ed0.x * 0.8, ed0.y);
    float cover = smoothstep(0.4 * frost, 0.02, edgeD);
    float dens = 0.0;
    float cs = 0.1;
    vec2 gi0 = floor(p / cs);
    for (int j = -2; j <= 2; ++j)
    for (int i = -2; i <= 2; ++i) {
        vec2 c = gi0 + vec2(i, j);
        float h = hash21(c + 3.0);
        vec2 root = (c + 0.2 + 0.6 * vec2(hash21(c + 1.0), hash21(c + 2.0))) * cs;
        vec2 rd = vec2(0.5 * aspect, 0.5) - abs(root);
        float rc = smoothstep(0.4 * frost, 0.02, min(rd.x * 0.8, rd.y));
        if (h > 0.35 + 0.65 * rc) continue;
        float ang = hash21(c + 5.0) * 6.2831853;
        // At most two cells long, or the 5x5 search clips it.
        float len = (0.09 + 0.07 * hash21(c + 6.0)) * (0.6 + 0.6 * rc) * (0.95 + 0.05 * sin(T * 0.01 + h * 6.0));
        vec2 d = p - root;
        vec2 q = vec2(dot(d, vec2(cos(ang), sin(ang))), dot(d, vec2(-sin(ang), cos(ang))));
        float fd = fern(q, len, h * 10.0 + 1.0) * (0.55 + 0.45 * rc);
        dens = 1.0 - (1.0 - dens) * (1.0 - fd);                   // overlapping ferns build up
    }
    dens = max(dens, cover * (0.25 + 0.35 * fbm(p * 30.0)));             // the fine frost film between the ferns
    // A frosted rim along the pane's edges, fading inward.
    vec2 ed = vec2(0.5 * aspect, 0.5) - abs(p);
    float rim = exp(-min(ed.x, ed.y) * (14.0 - 6.0 * frost)) * (0.6 + 0.4 * fbm(p * 20.0));
    dens = max(dens, rim);

    // Ice: white, catching the dawn light; gold where the sun is behind.
    float lit = exp(-sd * 2.2);
    vec3 ice = mix(vec3(0.85, 0.9, 1.0), vec3(1.0, 0.85, 0.55), lit) * (0.7 + 0.5 * lit * (0.7 + 0.5 * swell));
    // Frost scatters the view behind it.
    vec3 col = mix(outside, ice, clamp(dens * 1.1, 0.0, 0.95));
    // Sparkles on the crystals: round glints, winking.
    vec2 g = p * 140.0, gi = floor(g), gf = fract(g);
    vec2 gc = 0.25 + 0.5 * vec2(hash21(gi + 3.0), hash21(gi + 4.0));
    float wink = pow(0.5 + 0.5 * sin(T * 2.0 + hash21(gi) * 40.0), 8.0);
    col += vec3(1.0, 0.95, 0.85) * smoothstep(0.15, 0.0, length(gf - gc)) * step(0.85, hash21(gi + 7.0)) * dens * wink * (0.4 + 1.2 * hi) * (0.4 + lit);
    // Condensation haze on the glass.
    col = mix(col, vec3(0.9, 0.85, 0.85), 0.08 * fbm(p * 4.0));

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
