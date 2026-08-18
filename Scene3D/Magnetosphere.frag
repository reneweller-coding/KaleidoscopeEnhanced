#version 330 core
out vec4 fragColor;
// Magnetosphere.frag — a dark planet inside self-luminous plasma.
// The field lines are emissive, not lit: a plasma tube glows on its own and
// shading it like a solid would flatten it into wire.  The planet is the
// opposite — nearly black, lit only by its star and by the field around it.

in vec3  vObj;
in vec3  vNormal;
in vec3  vView;
in float vEnergy;
in float vKind;       // 2 = planet, else the field line's shell fraction 0..1

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
uniform float shellsP;
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
    vec3 L = normalize(vec3(0.72, 0.34, -0.60));

    vec3 col;

    if (vKind > 1.5)
    {
        // --- planet: the photo as its surface, lit hard from one side ---
        vec2 uv = vec2(atan(vObj.z, vObj.x) / 6.2831853 + 0.5,
                       clamp(vObj.y * 0.5 + 0.5, 0.0, 1.0));
        vec3 surf = textureLod(tex0, fract(uv * vec2(1.0, 0.9)), 0.0).rgb;
        surf = mix(vec3(dot(surf, vec3(0.333))), surf, 0.6) * 0.85;

        float diff = max(dot(n, L), 0.0);
        float wrap = 0.5 + 0.5 * dot(n, L);
        col = surf * (0.10 + 1.05 * diff + 0.35 * wrap * wrap);

        // Atmosphere: a cold ring at the limb, and aurora caps where the field
        // lines come down.
        float limb = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 3.5);
        col += vec3(0.25, 0.55, 1.0) * limb * (0.7 + 1.2 * audioLevel);
        float polar = pow(abs(vObj.y), 6.0);
        col += vec3(0.30, 1.0, 0.55) * polar
             * (0.35 + 1.4 * audioHigh + 0.8 * audioKick) * (0.4 + glowP);
    }
    else
    {
        // --- field line: emissive plasma ---
        // Hue follows the SHELL the line belongs to — carried down from the
        // generator — so the spectrum is legible as colour: the tight inner
        // lines run hot, the far ones cold.
        float shell = clamp(vKind, 0.0, 1.0);
        float hue = fract(0.02 + 0.62 * shell + 0.06 * sin(audioChromaHue));
        vec3 plasma = hue2rgb(hue);

        // The tube's own curvature: brightest where it faces the eye, which is
        // what gives a glowing cylinder its core-and-halo look.
        float face = clamp(dot(n, V), 0.0, 1.0);
        float core = pow(face, 1.6);

        float e = vEnergy;
        col = plasma * (0.06 + 2.6 * e) * (0.35 + 0.9 * core) * (0.45 + glowP);
        // White-hot centre, kept in check: pushed harder it blows the inner
        // shells to white and the whole shell-to-hue mapping stops being
        // readable exactly where the energy is highest.
        col += vec3(1.0) * pow(core, 6.0) * e * 0.5;

        // A faint floor, so the shape of the field survives a silent bar.
        col += plasma * 0.05 * (0.4 + 0.7 * audioAmbient);
    }

    col *= 1.0 + 0.22 * audioBeat + 0.18 * audioSubBass;
    col = col / (1.0 + col * 0.24);
    fragColor = vec4(col, interpolation);
}
