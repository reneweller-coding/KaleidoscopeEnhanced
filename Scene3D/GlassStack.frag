#version 330 core
// GlassStack.frag — one shader, two very different jobs.
// -----------------------------------------------------------------------
// In the opaque pass it writes an ordinary colour.  In the transparent pass it
// writes into the two OIT accumulation targets instead, and what it writes is
// not a colour but a CONTRIBUTION: premultiplied colour times a weight, and the
// alpha that eats into the revealage.
//
// The weight is the whole technique.  It has to fall off with depth so that
// nearer layers dominate — that is what stands in for sorting — but it must
// never reach zero, or a distant layer vanishes instead of being faint.  The
// polynomial below is the one from the original paper, chosen so its useful
// range covers the depths a typical scene occupies.
// -----------------------------------------------------------------------
layout(location = 0) out vec4 outAccum;
layout(location = 1) out vec4 outReveal;

in vec3  vObj;
in vec3  vNormal;
in vec3  vView;
in float vShell;
in float vKind;

uniform sampler2D tex0;
uniform float interpolation;
uniform float time;
uniform float oitPass;
uniform vec2  nearFar;

uniform float audioLevel;
uniform float audioBeat;
uniform float audioKick;
uniform float audioHigh;
uniform float audioSubBass;
uniform float audioChromaHue;
uniform float audioAmbient;

uniform float glassP;       // preset: how dense each pane is
uniform float glowP;

vec3 hue2rgb(float h)
{
    return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
}

void main()
{
    vec3 n = normalize(vNormal);
    vec3 V = normalize(vView);
    if (dot(n, V) < 0.0) n = -n;

    vec3 L = normalize(vec3(0.5, 0.68, -0.55));
    float fres = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 3.5);

    if (oitPass < 0.5)
    {
        // ---- opaque core ----
        float diff = max(dot(n, L), 0.0);
        vec3 base = mix(vec3(0.10, 0.11, 0.16),
                        hue2rgb(fract(0.06 + 0.09 * sin(audioChromaHue))), 0.55);
        vec3 col = base * (0.45 + 1.5 * diff);
        vec3 H = normalize(L + V);
        col += vec3(1.0, 0.96, 0.9) * pow(max(dot(n, H), 0.0), 70.0)
             * (0.8 + 2.0 * audioHigh);
        col += base * fres * (0.6 + 1.4 * audioKick);
        col *= 1.0 + 0.2 * audioBeat;
        col = col / (1.0 + col * 0.28);
        outAccum  = vec4(col, interpolation);
        outReveal = vec4(0.0);
        return;
    }

    // ---- glass shell ----
    float hue = fract(0.52 + 0.42 * vShell + 0.07 * sin(audioChromaHue));
    vec3 tint = mix(vec3(0.55, 0.75, 0.95), hue2rgb(hue), 0.65);

    // Thin at face-on, dense at grazing angles — that is what glass does, and
    // it is what makes a stack of panes read as volume rather than as decals.
    float alpha = clamp((0.10 + 0.42 * fres) * (0.5 + 1.3 * glassP), 0.0, 0.92);

    vec3 col = tint * (0.55 + 0.9 * max(dot(n, L), 0.0));
    vec3 H = normalize(L + V);
    col += vec3(1.0) * pow(max(dot(n, H), 0.0), 90.0) * (0.6 + 2.2 * audioHigh);
    col += tint * fres * (0.5 + 1.1 * glowP) * (0.4 + 1.2 * audioKick);
    col += tint * 0.25 * audioAmbient;
    col *= 1.0 + 0.20 * audioBeat + 0.15 * audioSubBass;

    // The depth weight.  gl_FragCoord.z is non-linear, so it is turned back
    // into a distance first — feeding the raw value in would push almost every
    // fragment into the same weight bucket and the ordering hint would be lost.
    float zn = nearFar.x, zf = nearFar.y;
    float ndc = gl_FragCoord.z * 2.0 - 1.0;
    float z = (2.0 * zn * zf) / (zf + zn - ndc * (zf - zn));

    float w = alpha * max(1e-2, 3e3 * pow(1.0 - z / zf, 3.0));
    w = clamp(w, 1e-2, 3e3);

    // Premultiplied colour into the accumulator, plain alpha into revealage.
    // The framebuffer blend does the rest: attachment 0 adds, attachment 1
    // multiplies by (1 - src).
    outAccum  = vec4(col * alpha, alpha) * w;
    outReveal = vec4(alpha);
}
