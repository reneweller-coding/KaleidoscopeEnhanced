#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file HologramGauze.frag
 * @brief HOLOGRAM GAUZE: the Pepper's-ghost trick of a modern stage show -- an
 * invisible gauze stretched across a dark stage, and on it, floating in
 * mid-air, a giant dancer of light, arms raised, her gown dissolving into
 * light below, filled with the photograph: its bright parts glowing, its
 * dark parts thinning out, fine scan lines running
 * through it, a cold halo around it.  It turns slowly in space as if it
 * stood there in three dimensions.  Behind it the stage is black, heavy
 * red curtains frame the opening, the floor mirrors the apparition, and
 * the audience sits in silhouette with the ghost's light on their heads.
 * The camera is still.
 *
 * Audio Reactivity:
 *   audioBass   -> the apparition's brightness (light)
 *   audioHigh   -> the shimmer of the scan lines (light)
 *   audioSwell  -> the haze in the projector beam (slow)
 *   audioLevel  -> brightness
 *   sceneTime / sceneAdvance -> the slow turn, the drifting scan lines
 *
 * Per-activation variety: turnP (how far the figure turns), hueP.
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

uniform float turnP;
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
/// @brief Smooth minimum of two distances (blend width k).
float smin(float a, float b, float k)
{
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
}
/// @brief Fractal noise: octaves of value noise.
float fbm(vec2 p)
{
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; ++i) { v += a * noise2(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 2.3; a *= 0.5; }
    return v;
}

const vec2  HC = vec2(0.0, 0.07);        // centre of the apparition
const vec2  HS = vec2(0.3, 0.3);        // its half size
const float STAGEY = -0.2;               ///< stage floor line
float gT, gAng, gHi;

/// The apparition at a screen point: glow colour (rgb) and coverage (a).
vec4 ghost(vec2 p)
{
    // Invert the perspective of a plane turned about the vertical axis.
    vec2 q = p - HC;
    float k = 1.1, s = sin(gAng), c = cos(gAng);
    float u = q.x / (c - k * q.x * s);
    float v = q.y * (1.0 + k * u * s);
    vec2 hu = vec2(u / HS.x, v / HS.y);                 // -1..1 across the figure
    if (c - k * q.x * s < 0.1) return vec4(0.0);
    // The figure: a floating dancer, arms raised and open, the body
    // tapering below the hips into light.
    vec2 m = vec2(abs(hu.x), hu.y);
    float y = hu.y;
    // One continuous body profile: shoulders, waist, hips, a wide skirt.
    float w = (y > 0.02) ? mix(0.12, 0.24, smoothstep(0.02, 0.42, y))
                         : mix(0.12, 0.18, smoothstep(0.02, -0.15, y)) + 0.2 * smoothstep(-0.15, -0.9, y);
    w += 0.015 * sin(y * 9.0 + gT * 0.3) * smoothstep(-0.2, -0.8, y);    // the skirt sways softly
    float d = max(m.x - w, y - 0.44) - 0.03;
    d = smin(d, sdSeg(m, vec2(0.0, 0.44), vec2(0.0, 0.56)) - 0.045, 0.04);   // neck
    d = smin(d, length((hu - vec2(0.0, 0.66)) * vec2(1.0, 0.88)) - 0.1, 0.03); // head
    d = smin(d, sdSeg(m, vec2(0.2, 0.42), vec2(0.5, 0.64)) - 0.045 + 0.01 * smoothstep(0.2, 0.5, m.x), 0.06);   // upper arms
    d = smin(d, sdSeg(m, vec2(0.5, 0.64), vec2(0.72, 0.9)) - 0.03, 0.04);    // forearms
    d = smin(d, length(m - vec2(0.74, 0.93)) - 0.035, 0.02);                  // hands
    float dissolve = smoothstep(-1.0, -0.45, hu.y + 0.3 * (fbm(hu * 4.0 + vec2(0.0, gT * 0.1)) - 0.5));
    float mask = smoothstep(0.02, -0.02, d) * dissolve;
    float line = exp(-abs(d) * 60.0) * dissolve * 0.6;
    if (mask <= 0.0 && line < 0.01) return vec4(0.0);
    vec3 ph = img(clamp(hu * 0.5 + 0.5, 0.0, 1.0));
    float lum = dot(ph, vec3(0.3, 0.55, 0.15));
    // Luminance keying: the dark parts of the photo thin out, but the
    // figure keeps a floor of light so it stays whole.
    float a = (0.3 + 0.7 * smoothstep(0.1, 0.6, lum)) * mask;
    vec3 tint = mix(vec3(0.55, 0.85, 1.0), imgPalette(0.5 + hueP * 0.159) * 1.2, 0.3);
    vec3 g = mix(ph, vec3(lum) * tint * 1.4, 0.55);
    // Scan lines drifting upward, shimmering with the highs.
    float sl = 0.88 + 0.12 * sin(hu.y * 230.0 - gT * 1.2);
    float shimmer = 0.92 + 0.08 * gHi * sin(hu.y * 700.0 + gT * 7.0);
    g *= sl * shimmer;
    // A bright outline, and light drifting off it.
    g = g * a + tint * line * (0.9 + 0.4 * fbm(hu * 8.0 + vec2(0.0, -gT * 0.1)));
    a = max(a, line);
    g /= max(a, 1e-3);
    return vec4(g, a);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float bass = clamp(audioBass, 0.0, 1.0);
    gHi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    gT = sceneTime + sceneAdvance * 0.4;
    gAng = (0.15 + 0.35 * clamp(turnP, 0.0, 1.0)) * sin(gT * 0.035);

    float bright = 0.8 + 0.6 * bass;

    // The dark stage: a black box, a faint blue wash on the back wall.
    vec3 col = vec3(0.01, 0.012, 0.02) + vec3(0.02, 0.03, 0.06) * smoothstep(0.5, -0.1, abs(p.x)) * smoothstep(STAGEY, 0.3, p.y);
    // The stage floor: glossy black, mirroring the apparition.
    if (p.y < STAGEY) {
        vec2 mq = vec2(p.x, 2.0 * STAGEY - p.y);
        mq.x += 0.004 * (noise2(p * vec2(30.0, 120.0)) - 0.5);
        vec4 gr = ghost(mq);
        float f = exp(-(STAGEY - p.y) * 7.0);
        col += gr.rgb * gr.a * 0.3 * f * bright;
        col += vec3(0.02, 0.03, 0.05) * f;
    }

    // The projector beam from above the audience, visible in the haze.
    {
        vec2 src = vec2(0.0, 0.62);
        vec2 d = p - src;
        float ang = abs(atan(d.x, -d.y));
        float cone = smoothstep(0.45, 0.25, ang) * smoothstep(0.62, 0.0, length(d) * 0.6);
        float hz = 0.6 + 0.4 * fbm(p * 3.0 + vec2(gT * 0.02, 0.0));
        col += vec3(0.4, 0.6, 0.9) * cone * hz * (0.03 + 0.06 * swell) * bright;
    }

    // The apparition on the gauze, and its halo in the haze around it.
    vec4 g = ghost(p);
    col += g.rgb * g.a * bright * 1.3;
    float halo = exp(-max(length((p - HC) / (HS * vec2(1.1, 1.2))) - 0.7, 0.0) * 5.0);
    col += vec3(0.35, 0.55, 0.9) * halo * 0.08 * bright;
    // The gauze itself shows only faintly where the light touches it.
    col += vec3(0.5, 0.6, 0.7) * 0.015 * (0.5 + 0.5 * sin(p.x * 90.0 + 2.0 * noise2(p * 5.0))) * halo * bright;

    // Heavy red curtains framing the stage opening, their folds catching the glow.
    {
        float sideW = 0.5 * aspect - 0.62;
        float xo = abs(p.x) - (0.5 * aspect - sideW);
        float swag = p.y - (0.42 - 0.04 * cos(p.x * 7.0));
        if (xo > 0.0 || swag > 0.0) {
            float fx = xo > 0.0 ? p.x : p.x * 1.4;
            float folds = 0.5 + 0.5 * sin(fx * 70.0 + 1.5 * sin(p.y * 4.0));
            vec3 cur = vec3(0.35, 0.03, 0.04) * (0.2 + 0.8 * folds * folds);
            float lightOn = 0.08 + 0.3 * exp(-max(xo, 0.0) * 12.0) * smoothstep(0.5, -0.1, p.y);
            if (swag > 0.0) lightOn = 0.1 + 0.2 * exp(-swag * 20.0);
            col = cur * lightOn * bright;
        }
    }

    // The audience in silhouette, the ghost's cold light on their heads.
    {
        float crowd = 0.0, rimL = 0.0;
        for (int row = 0; row < 2; ++row) {
            float fr = float(row);
            float sc = 1.0 - 0.3 * fr;
            float cols = 11.0 / sc;
            float hi = floor(p.x * cols);
            for (int k = -1; k <= 1; ++k) {
                float id = hi + float(k);
                float r = hash21(vec2(id, 7.0 + fr * 13.0));
                vec2 c = vec2((id + 0.5 + 0.4 * (r - 0.5)) / cols, -0.39 + 0.07 * fr + 0.02 * r);
                float ps = sc * (0.85 + 0.3 * hash21(vec2(id, 9.0 + fr * 13.0)));
                vec2 q = (p - c) / ps;
                float head = length(q * vec2(1.0, 0.85)) - 0.034;
                float body = length((q - vec2(0.0, -0.1)) * vec2(0.5, 1.0)) - 0.065;
                float d = min(head, body) * ps;
                float cov = smoothstep(0.0015, -0.0015, d);
                if (cov > crowd) {
                    crowd = cov;
                    // Rim along the top of the head, facing the stage.
                    rimL = smoothstep(-0.008 * ps, 0.0, d) * smoothstep(-0.01, 0.02, q.y) * cov;
                }
            }
        }
        col = mix(col, vec3(0.005, 0.006, 0.01), crowd);
        col += vec3(0.4, 0.6, 0.9) * rimL * 0.25 * bright;
    }

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
