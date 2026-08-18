#version 330 core
out vec4 fragColor;
// DrumSkin.frag — mylar: a thin, tight, slightly iridescent film with a very
// hard specular.  The material matters more than usual here, because the mode
// shape is only legible through the way the surface catches light — a matte
// drumhead under diffuse light shows almost nothing, however hard it is
// vibrating.

in vec3  vObj;
in vec3  vNormal;
in vec3  vView;
in float vDisp;
in float vRad;

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

    // The key sits between the camera and straight up.  Put it behind the head
    // and the tilted disc turns away from it, which is how the first version
    // came out as a dark plate with the pattern barely readable.
    vec3 L  = normalize(vec3(0.30, 0.72, -0.62));
    vec3 L2 = normalize(vec3(-0.68, 0.34, -0.65));

    // Sign matters: a crest and a trough are physically different parts of the
    // mode, and colouring by |displacement| throws away exactly the information
    // that makes the nodal lines visible.
    float d = clamp(vDisp * 2.4, -1.0, 1.0);
    float node = 1.0 - smoothstep(0.0, 0.16, abs(vDisp));

    float hue = fract(0.58 + 0.34 * hueP + 0.16 * d + 0.05 * sin(audioChromaHue));
    vec3 film = hue2rgb(hue);
    // Iridescence: the tint shifts with viewing angle, the way a thin film does.
    float fres = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 3.0);
    film = mix(film, hue2rgb(fract(hue + 0.22)), fres);

    // Lift the film toward white: a fully saturated hue is dark in luminance,
    // and a drumhead lit hard is a bright object.
    film = mix(film, vec3(1.0), 0.22);
    vec3 base = mix(vec3(0.18, 0.19, 0.24), film, 0.72);

    float diff = max(dot(n, L), 0.0);
    vec3 col = base * (0.30 + 1.05 * diff);
    col += base * max(dot(n, L2), 0.0) * vec3(0.35, 0.45, 0.65) * 0.65;

    // The hard highlight is what draws the mode.  A tight lobe turns a gentle
    // slope change into a moving band of light, which is how a real drumhead
    // shows what it is doing.
    vec3 H  = normalize(L + V);
    vec3 H2 = normalize(L2 + V);
    // Two widths.  A very tight lobe alone puts a single dot on the head; the
    // broader one is what sweeps along each ridge of the mode and draws it.
    col += vec3(1.0, 0.98, 0.94) * pow(max(dot(n, H), 0.0), 55.0)
         * (1.1 + 2.2 * audioHigh);
    col += film * pow(max(dot(n, H2), 0.0), 14.0) * 0.60;

    // Nodal lines glow faintly: the places that are NOT moving are the pattern.
    col += hue2rgb(fract(hue + 0.5)) * node * (0.10 + 0.35 * glowP)
         * (0.4 + 1.1 * audioKick);

    col += film * fres * (0.20 + 0.5 * glowP);

    // The hoop.
    float rim = smoothstep(0.90, 0.99, vRad);
    col = mix(col, vec3(0.16, 0.15, 0.17) * (0.4 + 1.2 * max(dot(n, L), 0.0)), rim);

    col *= 1.0 + 0.20 * audioBeat + 0.14 * audioSubBass;
    col += film * 0.20 * audioAmbient;
    col = col / (1.0 + col * 0.26);
    fragColor = vec4(col, interpolation);
}
