#version 330 core
// CathedralGlass.frag — stone in the opaque pass, glass in the transparent one.
// -----------------------------------------------------------------------
// Stained glass is not lit, it is BACKlit: the pane's colour is what survives
// the light passing through it, not what bounces off it.  So the glass here has
// almost no diffuse term and a large emissive one, scaled by the band that pane
// stands for.  Getting this the usual way round — key light, specular, a bit of
// ambient — produces coloured plastic.
// -----------------------------------------------------------------------
layout(location = 0) out vec4 outAccum;
layout(location = 1) out vec4 outReveal;

in vec3  vObj;
in vec3  vNormal;
in vec3  vView;
in float vKind;
in float vLevel;

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

uniform float glowP;
uniform float hueP;

vec3 hue2rgb(float h)
{
    return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
}

void main()
{
    vec3 n = normalize(vNormal);
    vec3 V = normalize(vView);
    if (dot(n, V) < 0.0) n = -n;

    float rad = length(vObj.xy);
    float ang = atan(vObj.y, vObj.x);

    if (oitPass < 0.5)
    {
        // ---- stone tracery ----
        vec3 L = normalize(vec3(0.35, 0.55, 0.75));
        float diff = max(dot(n, L), 0.0);
        vec3 stone = vec3(0.13, 0.125, 0.135);
        vec3 col = stone * (0.55 + 1.1 * diff);
        // Lead darkens toward the rim so the window has a weight to it.
        col *= 1.0 - 0.35 * clamp(rad / 4.2, 0.0, 1.0);
        col += stone * 0.9 * audioAmbient;
        col = col / (1.0 + col * 0.3);
        outAccum  = vec4(col, interpolation);
        outReveal = vec4(0.0);
        return;
    }

    // ---- glass ----
    // vKind is 1, 2 or 3 for the three wheels, 4 for the oculus.
    bool isEye = (vKind > 3.5);
    float layer = isEye ? 0.0 : clamp(vKind - 1.0, 0.0, 2.0);
    float front = 1.0 - 0.30 * layer;

    // Hue runs around the wheel and steps out with the ring, which is how a real
    // rose window is laid out: a colour per petal, a value per course.
    float hue = fract(0.62 * hueP + ang / 6.2831853 + 0.11 * floor(rad / 0.72)
                      + 0.07 * layer + 0.06 * sin(audioChromaHue));
    vec3 tint = hue2rgb(hue);
    tint = mix(tint, vec3(1.0, 0.93, 0.78), 0.08 + 0.10 * layer);

    float lit = (0.30 + 1.65 * vLevel) * front;
    vec3 col = tint * lit * (0.55 + 0.9 * glowP)
             * (0.75 + 0.55 * audioLevel + 0.45 * audioKick);

    // The oculus stays open, so the ring around it has to do its work: it burns
    // brightest at its inner edge and falls away outward, which reads as light
    // pouring through the hole rather than as a hole.
    float eye = isEye ? (1.0 - smoothstep(0.55, 1.30, rad))
                      : (1.0 - smoothstep(1.30, 2.20, rad)) * 0.30;
    // Keep the glow tinted rather than white: a warm light poured over every
    // pane at full strength washes the colour out of the window, and the colour
    // is the only thing a rose window is for.
    col += mix(vec3(1.0, 0.88, 0.62), tint, 0.72) * eye
         * (0.55 + 0.9 * glowP) * (0.85 + 1.5 * audioKick + 0.5 * audioLevel);

    // A faint sheen so the pane is a surface and not a hole in the wall.
    vec3 L = normalize(vec3(0.35, 0.55, 0.75));
    vec3 H = normalize(L + V);
    col += vec3(1.0) * pow(max(dot(n, H), 0.0), 60.0) * (0.25 + 1.1 * audioHigh);
    col += tint * 0.30 * audioAmbient;
    col *= 1.0 + 0.20 * audioBeat + 0.14 * audioSubBass;

    // Tone-map BEFORE accumulating, not after resolving.  The accumulation
    // target is RGBA16F and the OIT weight multiplies by up to a few hundred, so
    // an emissive colour that runs to 10 overflows half precision, becomes
    // +Inf, and the resolve's inf guard paints it black.  The symptom is the
    // opposite of the cause: the BRIGHTEST part of the image is the part that
    // goes dark, which is why the oculus kept coming out as a hole.
    col = col / (1.0 + col * 0.22);

    // Loud panes go denser as well as brighter, so a band that comes in reads
    // as glass filling with colour rather than as a lamp behind it.
    float alpha = clamp((0.28 + 0.42 * vLevel) * (1.0 - 0.24 * layer)
                        + (isEye ? 0.20 : 0.0), 0.0, 0.90);

    float zn = nearFar.x, zf = nearFar.y;
    float ndc = gl_FragCoord.z * 2.0 - 1.0;
    float z = (2.0 * zn * zf) / (zf + zn - ndc * (zf - zn));

    // The paper's 3e3 ceiling assumes low-dynamic-range colour.  A few hundred
    // leaves the same relative ordering between near and far layers with an
    // order of magnitude of headroom against fp16.
    float w = alpha * max(1e-2, 2.5e2 * pow(1.0 - z / zf, 3.0));
    w = clamp(w, 1e-2, 2.5e2);

    outAccum  = vec4(col * alpha, alpha) * w;
    outReveal = vec4(alpha);
}
