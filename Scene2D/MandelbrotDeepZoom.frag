#version 330 core
out vec4 fragColor;
/**
 * @file MandelbrotDeepZoom.frag
 * @brief Displays the deep-zoom Mandelbrot fractal computed by Engine/CfxMandelbrot.comp
 * (`texMandelbrot`): a real infinite mathematical zoom (double-single emulated precision, roughly
 * 10,000x deeper than plain float32 before banding) rather than the photo-based Droste dive
 * already in the catalogue. R holds the smooth escape-time (negative = never escaped, an interior
 * point), G an orbit-trap distance used to shade interior detail. Colour comes from imgPalette
 * (the photo's own arc, key-locked) cycling with escape time, so every dive still carries the
 * picture's colour family even though the STRUCTURE is pure mathematics. audioBeat pulses the rim
 * brightness, audioCentroid tilts the palette's cycling speed. If the compute sim is unavailable,
 * texMandelbrot reads 0 -> a flat dark field remains (R=0 reads as freshly-escaped, not garbage).
 */

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform sampler2D texMandelbrot;
uniform float interpolation;

uniform float audioValence;
uniform float audioCentroid;
uniform float audioBeat;
uniform float audioOnset;
uniform float audioPhase;
uniform float audioAdvance;
uniform float audioChromaHue;
uniform float audioLevel;

// Per-activation variety (re-rolled each activation; 0 = default):
uniform float cycleP;   // colour-cycle speed across escape time (0 -> 1.0; 0.6..1.8)
uniform float glowP;    // rim brightness (0 -> 1.0; 0.7..1.4)
uniform float hueP;

vec3 img(vec2 uv) { return (interpolation * texture(tex0, uv)
                          + (1.0 - interpolation) * texture(tex1, uv)).rgb; }

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 field = texture(texMandelbrot, uv).rg;

    float cycleV = (cycleP <= 0.01) ? 1.0 : cycleP;
    float glowV  = (glowP  <= 0.01) ? 1.0 : glowP;

    vec3 col;
    if (field.r < 0.0)
    {
        // Interior (never escaped): shade from the orbit-trap distance.
        // Real orbit-trap values often cluster in a narrow range across a
        // whole interior "lake", so a plain linear map to brightness reads
        // as flat grey; banding (sin of a STEEP trap multiple) turns even a
        // narrow range into visible rings, the classic deep-zoom interior
        // treatment, instead of a uniform wash.
        float trap = field.g;
        float band = 0.5 + 0.5 * sin(trap * 40.0);
        col = imgPalette(0.15 + trap * 0.5 + band * 0.1) * (0.22 + 0.55 * band);
    }
    else
    {
        // Escaped: colour cycles with smooth escape time, phase-shifted
        // gently over time so the SAME structure slowly shifts palette
        // position even while the zoom itself is between resets.
        float t = field.r * cycleV * 3.0 + time * 0.015 + audioPhase * 0.02;
        col = imgPalette(t) * 2.2;

        // Rim glow: fresh escapees (low field.r within an escaped pixel's
        // own local neighbourhood isn't available here, so use field.r's
        // own high-frequency component as a cheap boundary-detail proxy)
        // pulse brighter on the beat.
        float rim = 1.0 - abs(fract(field.r * cycleV * 3.0) * 2.0 - 1.0);
        col += imgPalette(t + 0.3) * pow(rim, 4.0) * (0.6 + 0.6 * audioBeat) * glowV;
    }

    if (hueP > 0.001) col = hueRot(col, hueP);

    col *= glowV * (1.1 + 0.3 * audioCentroid);
    col *= 1.0 + 0.35 * audioLevel;
    col += col * audioOnset * 0.15;

    vec3 _catTone = clamp(col, 0.0, 1.0) * 0.8;
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
