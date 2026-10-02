#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file DoubleSlitElectronBuildup.frag
 * @brief DOUBLE SLIT ELECTRON BUILD-UP: the experiment that shows one
 * particle at a time still interferes, in two panels.  On the left, seen
 * from above: the gun, the barrier with its two slits, and the waves --
 * plane waves before the barrier, two circular waves after it, crossing
 * into bright and dark rays.  On the right, the phosphor screen face on:
 * single electrons arrive as round green dots, each at a place drawn from
 * the interference probability, and over the scene arc the dots pile up
 * into the fringes the waves predicted.  The fringe spacing follows the
 * tonal centre (slowly), fresh arrivals flash on an onset, the gun glows
 * with the bass.  Camera still.
 *
 * Audio Reactivity:
 *   sceneProgress  -> accumulation (the arc)
 *   audioChromaHue -> fringe spacing (slow)
 *   audioOnset     -> the newest arrivals flash (light)
 *   audioBass      -> gun glow (light)
 *   audioLevel     -> brightness
 *
 * Per-activation variety: slitP (slit separation), grainP, hueP.
 */
uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float sceneAdvance;   ///< The music's advance since this scene was activated (integrated, never jumps).
uniform float sceneTime;   ///< Seconds since this scene was activated.
uniform float sceneProgress;   ///< Progress through this scene's solo time, 0..1.
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioOnset;   ///< Onset envelope (any instrument), 0..1.
uniform float audioBass;   ///< Bass band level, 0..1.
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.

uniform float slitP;
uniform float grainP;
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
float hash21(vec2 p)
{
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

/// Far-field two-slit intensity at transverse position y on a screen at
/// distance L: cos^2 fringes under a single-slit sinc^2 envelope.
float fringe(float y, float d, float k, float L)
{
    float s = y / sqrt(y * y + L * L);
    float a = 0.5 * k * d * s;
    float b = 0.5 * k * 0.03 * s;
    float env = (abs(b) < 1e-3) ? 1.0 : pow(sin(b) / b, 2.0);
    return cos(a) * cos(a) * env;
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);
    float hue = (hueP > 0.001) ? hueP : 0.0;
    float prog = clamp(sceneProgress, 0.0, 1.0);
    float T = sceneTime + sceneAdvance * 0.5;
    float d = 0.1 + 0.08 * clamp(slitP, 0.0, 1.0);          // slit separation
    // Wavelength follows the tonal centre, slowly (audioChromaHue is
    // continuous; only its sine is used).
    float k = 110.0 * (1.0 + 0.12 * sin(audioChromaHue));
    vec3 waveC = mix(vec3(0.3, 0.8, 1.0), imgPalette(0.55 + hue * 0.159), 0.2);
    vec3 phos = mix(vec3(0.45, 1.0, 0.6), imgPalette(0.35 + hue * 0.159), 0.15);

    vec3 col = vec3(0.01, 0.012, 0.02);

    // --- Left: the experiment from above -------------------------------
    // Source at the left, barrier with two slits, waves spreading to the
    // screen line on the right of this panel.
    float xs = -0.8, xb = -0.35, xr = 0.12;
    if (p.x < xr) {
        vec2 q = p;
        if (q.x < xb) {
            // Plane-ish waves from the gun.
            float r = length(q - vec2(xs, 0.0));
            float w = cos(k * r - T * 6.0);
            col += waveC * (0.5 + 0.5 * w) * exp(-abs(q.y) * 3.0) * 0.35 * smoothstep(0.0, 0.05, r);
        } else {
            // Two circular waves from the slits, interfering.
            float r1 = length(q - vec2(xb, d * 0.5)), r2 = length(q - vec2(xb, -d * 0.5));
            float w = (cos(k * r1 - T * 6.0) / sqrt(r1 + 0.02) + cos(k * r2 - T * 6.0) / sqrt(r2 + 0.02));
            float I = w * w * 0.12;
            col += waveC * I * 0.6;
            // The fringe rays: time-averaged intensity, faint.
            float avg = (1.0 / (r1 + 0.02) + 1.0 / (r2 + 0.02) + 2.0 * cos(k * (r1 - r2)) / sqrt((r1 + 0.02) * (r2 + 0.02))) * 0.04;
            col += waveC * avg * 0.35;
        }
        // The barrier with its two slits.
        float bar = smoothstep(0.006, 0.003, abs(p.x - xb)) * step(0.012, min(abs(p.y - d * 0.5), abs(p.y + d * 0.5)));
        col = mix(col, vec3(0.5, 0.52, 0.58), bar);
        // The gun.
        float gun = length((p - vec2(xs - 0.02, 0.0)) * vec2(1.0, 2.5));
        col += vec3(1.0, 0.6, 0.3) * exp(-gun * 30.0) * (0.6 + 1.2 * clamp(audioBass, 0.0, 1.0));
        col = mix(col, vec3(0.2, 0.2, 0.24), smoothstep(0.045, 0.04, gun) * step(p.x, xs - 0.02));
        // The screen line, glowing where hits land.
        float sl = smoothstep(0.004, 0.0, abs(p.x - (xr - 0.01)));
        col += phos * sl * (0.2 + 0.8 * fringe(p.y, d, k, xr - xb) * prog);
    }

    // --- Right: the phosphor screen, face on ---------------------------
    if (p.x > xr + 0.03) {
        vec2 s = vec2(p.x - (xr + 0.03 + 0.37), p.y);          // screen centre
        vec2 half_ = vec2(0.34, 0.44);
        float inside = step(abs(s.x), half_.x) * step(abs(s.y), half_.y);
        // Frame.
        float frame = smoothstep(0.006, 0.0, abs(max(abs(s.x) - half_.x, abs(s.y) - half_.y)));
        col += vec3(0.3, 0.32, 0.38) * frame;
        if (inside > 0.0) {
            // The screen's horizontal axis is the transverse position y of
            // the left panel (scaled to fit).
            float yScr = s.x / half_.x * 0.45;
            float I = fringe(yScr, d, k, xr - xb);
            col = vec3(0.012, 0.018, 0.02) + phos * 0.015;
            // Electrons: round dots, each arriving at its own moment; the
            // chance of a dot anywhere is the interference intensity, so the
            // fringes emerge only as the dots pile up.
            float gs = 60.0 + 70.0 * clamp(grainP, 0.0, 1.0);
            vec2 g = s * gs;
            vec2 gi = floor(g), gf = fract(g);
            float h = hash21(gi);
            float arrive = hash21(gi + 7.3) / max(I, 0.02);      // lower = earlier, likelier where bright
            float shown = step(arrive, prog * 1.6);
            vec2 c = 0.25 + 0.5 * vec2(hash21(gi + 1.1), hash21(gi + 2.2));
            float dot_ = smoothstep(0.28, 0.1, length(gf - c)) * shown * step(0.25, h);
            float fresh = exp(-(prog * 1.6 - arrive) * 25.0) * shown;
            col += phos * dot_ * (0.6 + 1.6 * fresh * (0.5 + clamp(audioOnset, 0.0, 1.0)));
            col += phos * dot_ * 0.0;
            // The glow of the accumulated pattern.
            col += phos * I * prog * 0.12;
        }
    }

    col *= 0.85 + 0.3 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
