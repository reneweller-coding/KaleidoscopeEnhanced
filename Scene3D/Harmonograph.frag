#version 330 core
out vec4 fragColor;
// Harmonograph.frag — a drawn line, not a lit object.
// The wire is thinner than the shading would need to be interesting, so the
// colour carries the information instead: hue runs along the trace, so you can
// see where the pendulum started and where it has wound down to.

in vec3  vObj;
in vec3  vNormal;
in vec3  vView;
in float vAlong;      // 0 at the start of the trace, 1 at the end
in float vEnergy;

uniform sampler2D tex0;
uniform float interpolation;
uniform float time;

uniform float audioLevel;
uniform float audioBeat;
uniform float audioKick;
uniform float audioHigh;
uniform float audioSubBass;
uniform float audioChromaHue;
uniform float audioAmbient;

uniform float glowP;
uniform float hueP;
uniform sampler2D tex1;
uniform float audioAdvance;
uniform float audioValence;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}


// IMG-PALETTE (house standard): colours come from a rotating arc in the
// CURRENT slideshow image, so every activation inherits a fresh palette from
// the photos; the arc follows the musical key (audioChromaHue is circular-
// slewed = jump-free) with a slow advance drift, valence shapes saturation.
vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

vec3 hue2rgb(float h)
{
    return imgPalette(h) * 1.35;   // photo-arc palette (house standard), was HSV rainbow
}

void main()
{
    vec3 n = normalize(vNormal);
    vec3 V = normalize(vView);
    if (dot(n, V) < 0.0) n = -n;

    vec3 L = normalize(vec3(0.5, 0.7, -0.5));

    // Hue along the trace, so the drawing has a direction in time.
    // THREE turns of the wheel along the trace, not one.  The damping puts most
    // of the figure's visible area in the first fraction of the trace, so a
    // single turn spends nearly all its range on the tiny wound-down centre and
    // the big outer loops come out in one flat colour.
    float hue = fract(0.10 + 0.55 * hueP + 3.0 * vAlong + 0.06 * sin(audioChromaHue));
    vec3 tint = hue2rgb(hue);

    float face = clamp(dot(n, V), 0.0, 1.0);
    float core = pow(face, 1.7);

    // Mostly emissive, with just enough shading to give the wire roundness.
    float diff = max(dot(n, L), 0.0);
    vec3 col = tint * (0.20 + 0.35 * diff);
    col += tint * (0.9 + 2.0 * glowP) * (0.30 + 0.9 * core)
         * (0.45 + 0.8 * vEnergy + 0.5 * audioLevel);
    col += vec3(1.0) * pow(core, 8.0) * (0.4 + 1.4 * audioHigh);

    // The head of the trace burns brighter — the pendulum's first, widest
    // swings are where the figure's shape is set.
    col += tint * pow(max(1.0 - vAlong * 3.0, 0.0), 2.0)
         * (0.3 + 1.2 * audioKick);

    col += tint * 0.10 * audioAmbient;

    col *= 1.0 + 0.22 * audioBeat + 0.14 * audioSubBass;
    col = col / (1.0 + col * 0.26);
    fragColor = vec4(col, interpolation);
}
