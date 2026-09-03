#version 330 core
out vec4 fragColor;
/**
 * @file JuliaAudioMorph.frag
 * @brief A living Julia set: unlike a Mandelbrot deep-zoom dive (MandelbrotDeepZoom.frag), the
 * view stays at a fixed, moderate depth and instead the escape-time formula's constant `c` moves
 * continuously along a circle in the complex plane, driven by the musical key (audioChromaHue,
 * jump-free) and a slow audioAdvance drift -- the FRACTAL'S OWN SHAPE breathes, blooms and
 * reorganises with the harmony rather than the camera diving into unchanging detail. The classic
 * `c = 0.7885*exp(i*t)` circle is the source of well-known interesting Julia morphs; t here is the
 * audio-driven angle, so the shape is always somewhere on that circle but never idles or snaps.
 *   audioChromaHue -> which point on the "interesting Julia" circle (jump-free, key-locked)
 *   audioAdvance    -> slow additional drift so the same key doesn't freeze the shape
 *   audioBeat/audioKick -> brief zoom pulse
 *   audioSwell      -> gentle overall zoom breathing
 */

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioValence;
uniform float audioCentroid;
uniform float audioBeat;
uniform float audioKick;
uniform float audioOnset;
uniform float audioPhase;
uniform float audioAdvance;
uniform float audioChromaHue;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioBarPhase;

// Per-activation variety (re-rolled each activation; 0 = default):
uniform float zoomP;    // base zoom (0 -> 1.0; 0.7..1.6)
uniform float speedP;   // morph-circle traversal speed (0 -> 1.0; 0.5..1.8)
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
    float zoomV  = (zoomP  <= 0.01) ? 1.0 : zoomP;
    float speedV = (speedP <= 0.01) ? 1.0 : speedP;
    float glowV  = (glowP  <= 0.01) ? 1.0 : glowP;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    // Gentle, bounded zoom breathing (never a deep dive -- this scene's
    // whole point is the SHAPE changing, not the view depth).
    // Audited 2026-08-22: occupancy 0.25 was flagged, and BOTH zoom
    // directions measured worse (the glowing boundary filament loses
    // screen share either way -- the interior is dark, the exterior
    // fades). The framing is the scene's optimum; the flag is accepted
    // as the character of a thin-filament fractal.
    float zoom = (1.6 + 0.35 * sin(time * 0.05 + audioSwell * 0.6)) * zoomV;
    zoom *= 1.0 - 0.04 * audioSwell;
    vec2 z = uv * zoom;

    // The audio-driven angle around the "interesting Julia" circle --
    // jump-free (audioChromaHue is already circular-slewed) plus a slow
    // continuous drift so a held key doesn't freeze the shape outright.
    float t = audioChromaHue * speedV + audioAdvance * 0.05 * speedV;
    vec2 c = 0.7885 * vec2(cos(t), sin(t));

    const int MAXI = 130;
    float iter = 0.0;
    float trapMin = 1e6;
    for (int i = 0; i < MAXI; ++i)
    {
        float x = z.x * z.x - z.y * z.y + c.x;
        float y = 2.0 * z.x * z.y + c.y;
        z = vec2(x, y);
        trapMin = min(trapMin, abs(z.y));
        if (dot(z, z) > 4.0) { iter = float(i); break; }
        iter = float(MAXI);
    }

    vec3 col;
    if (iter >= float(MAXI - 1))
    {
        // Interior: shade from the orbit trap, banded (a narrow real trap
        // range still reads as visible rings rather than flat colour). The
        // palette angle rides on trapMin itself (not just the band), so the
        // interior sweeps a real colour range instead of sitting near one
        // narrow hue the whole time.
        float band = 0.5 + 0.5 * sin(trapMin * 30.0);
        col = imgPalette(0.15 + trapMin * 0.5 + band * 0.1) * (0.3 + 0.7 * band);
    }
    else
    {
        float logZn = log(dot(z, z)) * 0.5;
        float nu = log(logZn / log(2.0)) / log(2.0);
        float smoothIter = (iter + 1.0 - nu) / float(MAXI);
        float pt = smoothIter * 2.2 + time * 0.01;

        // Brightness rides on how long a pixel survived, not just its hue:
        // an instant escape (the vast majority of the canvas, far from the
        // set) falls toward black instead of the same pale mid-tone as
        // every other fast-escaping pixel, so the fractal's boundary reads
        // as a bright, detailed edge against real empty space rather than
        // a flat wash filling the whole frame.
        float glow = smoothstep(0.0, 0.12, smoothIter);
        col = imgPalette(pt) * (0.35 + 2.3 * glow);

        float rim = 1.0 - abs(fract(smoothIter * 2.2) * 2.0 - 1.0);
        col += imgPalette(pt + 0.3) * pow(rim, 4.0) * (0.5 + 0.6 * audioBeat) * glowV;
    }

    if (hueP > 0.001) col = hueRot(col, hueP);

    col *= glowV * (1.1 + 0.3 * audioCentroid);
    col *= 1.0 + 0.35 * audioLevel;
    col += col * audioOnset * 0.15;

    vec3 _catTone = clamp(col, 0.0, 1.0) * 1.0;
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
