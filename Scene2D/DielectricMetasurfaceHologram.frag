#version 330 core
out vec4 fragColor;
/**
 * @file DielectricMetasurfaceHologram.frag
 * @brief DIELECTRIC METASURFACE HOLOGRAM: a laser lights a metasurface --
 * a chip covered in nanopillars whose diameters follow a Fresnel-zone
 * pattern, so the surface shimmers in concentric rainbow rings like a CD
 * seen close -- and the chip throws a hologram into the air above it: the
 * photo, rendered in laser light as a floating field of glowing points with
 * the grain of speckle, inside a faint cone of light.  The hologram hangs
 * still and breathes a little; the chip's rainbow slides as the light
 * wanders over it.
 *
 * Replaces a Scene3D quad-grid version (a field of faint dots).
 *
 * Audio Reactivity:
 *   audioSwell  -> hologram brightness (slow)
 *   audioKick   -> the laser flares (light only)
 *   audioChromaHue / hueP -> laser colour
 *   sceneTime / sceneAdvance -> speckle, the light's slow wander (continuous)
 *
 * Per-activation variety: metaP (pillar density), phaseP (zone count),
 * speedP (speckle rate), hueP.
 */

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneTime;
uniform float sceneAdvance;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioKick;
uniform float audioLevel;
uniform float audioValence;
uniform float audioChromaHue;

uniform float metaP;
uniform float phaseP;
uniform float speedP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

float hash21(vec2 p)
{
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

vec3 spectral(float x)
{
    return clamp(abs(fract(x + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float kick = clamp(audioKick, 0.0, 1.0);
    float T = sceneTime + sceneAdvance * 0.5;
    float dens = clamp((metaP > 0.01) ? metaP : 1.0, 0.5, 2.0);
    float zones = 6.0 + 6.0 * clamp((phaseP > 0.01) ? phaseP : 1.0, 0.5, 2.0);
    float spd = clamp((speedP > 0.01) ? speedP : 1.0, 0.5, 2.0);
    float hue = (hueP > 0.001) ? hueP : 0.0;
    // Laser colour: green by default, drifting with the key a little.
    vec3 laser = spectral(0.33 + 0.08 * sin(hue) + 0.04 * sin(audioChromaHue));
    laser = normalize(laser + 0.05) * 1.3;

    // Lab darkness.
    vec3 col = vec3(0.008, 0.01, 0.018) + vec3(0.02, 0.03, 0.05) * smoothstep(-0.2, 0.5, p.y);

    float horizon = -0.08;
    // --- The chip, in perspective below the horizon ---------------------
    if (p.y < horizon) {
        float d = horizon - p.y;
        float z = 0.25 / d;
        vec2 w = vec2(p.x * z, z - 1.4);                          // chip plane coordinates
        vec2 wc = w;
        float chip = step(abs(wc.x), 1.6) * step(abs(wc.y), 1.4);
        if (chip > 0.0) {
            float r = length(wc);
            // Fresnel zones: the pillar diameter follows the phase of a lens.
            float phase = fract(r * r * zones * 0.35);
            float cells = 40.0 * dens;
            vec2 g = wc * cells;
            vec2 gi = floor(g), gf = fract(g) - 0.5;
            float pr = 0.12 + 0.3 * phase;
            float pill = smoothstep(pr + 0.06, pr - 0.02, length(gf));
            // Structural colour: diffraction angle from where we look and
            // where the light is -- rainbow rings sliding as the light wanders.
            float lx = 0.4 * sin(T * 0.05);
            float ang = (wc.x - lx) * 0.35 + r * 0.25 + phase * 0.5;
            vec3 iri = spectral(ang + 0.2 * sin(T * 0.03));
            vec3 base = vec3(0.05, 0.06, 0.08);
            vec3 c = mix(base, iri * 0.9, 0.35 + 0.5 * pill);
            c += vec3(0.9) * pill * pow(max(0.0, 1.0 - length(gf - vec2(-0.08, 0.08)) * 5.0), 4.0) * 0.4;
            // The laser spot at the chip centre.
            c += laser * exp(-r * r * 6.0) * (0.35 + 0.8 * kick);
            // Distance: the far chip fades and the fine pillars blur into
            // their average colour.
            float far = smoothstep(1.0, 3.5, z);
            c = mix(c, mix(base, iri * 0.9, 0.55), far);
            // Chip edge bevel.
            float edge = min(1.6 - abs(wc.x), 1.4 - abs(wc.y));
            c = mix(c, vec3(0.35, 0.37, 0.42), smoothstep(0.03, 0.0, edge));
            col = c * (1.0 - 0.6 * smoothstep(2.5, 6.0, z));
        }
    }

    // --- The laser beam coming in from the upper left -------------------
    {
        vec2 a = vec2(-0.95, 0.5), b = vec2(0.0, horizon - 0.12);
        vec2 pa = p - a, ba = b - a;
        float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
        float bd = length(pa - ba * h);
        col += laser * exp(-bd * 260.0) * 0.8 * (0.8 + 0.6 * kick) + laser * exp(-bd * 30.0) * 0.06;
    }

    // --- The hologram above the chip -------------------------------------
    vec2 hc = vec2(0.0, 0.2 + 0.01 * sin(T * 0.4));
    vec2 hs = vec2(0.42, 0.3);
    // Its light cone from the chip.
    {
        float ty = (p.y - (horizon - 0.12)) / (hc.y - hs.y - (horizon - 0.12));
        float coneW = mix(0.05, hs.x, clamp(ty, 0.0, 1.0));
        float cone = step(0.0, ty) * step(ty, 1.0) * smoothstep(coneW, coneW * 0.7, abs(p.x));
        col += laser * cone * 0.05 * (0.7 + 0.5 * swell);
    }
    vec2 hq = (p - hc) / hs;                                      // -1..1 over the image
    if (abs(hq.x) < 1.0 && abs(hq.y) < 1.0) {
        vec2 iuv = hq * 0.5 + 0.5;
        // The photo as a hologram: luminance and its edges, in laser light.
        vec3 ph = img(iuv);
        float L = dot(ph, vec3(0.3, 0.55, 0.15));
        vec2 e = vec2(5.0 / 540.0, 0.0);
        float gx = dot(img(iuv + e.xy) - img(iuv - e.xy), vec3(0.33));
        float gy = dot(img(iuv + e.yx) - img(iuv - e.yx), vec3(0.33));
        float edge = smoothstep(0.12, 0.45, length(vec2(gx, gy)) * 2.0);
        float I = 0.35 * L * L + 1.2 * edge;
        // Round points on a fine lattice, with speckle that shimmers.
        vec2 g = hq * vec2(hs.x / hs.y, 1.0) * 70.0;
        vec2 gi = floor(g), gf = fract(g) - 0.5;
        float speck = 0.5 + 0.5 * sin(hash21(gi) * 40.0 + T * 2.0 * spd);
        float dotm = smoothstep(0.42, 0.1, length(gf)) * (0.5 + 0.8 * speck);
        float frame = smoothstep(1.0, 0.92, max(abs(hq.x), abs(hq.y)));
        vec3 hcol = laser * (I * dotm * 2.2 + I * 0.08) * frame;
        // Faint scan bands drifting up.
        hcol *= 0.85 + 0.15 * sin(hq.y * 60.0 - T * 1.5 * spd);
        col += hcol * (0.8 + 0.6 * swell);
    }

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
