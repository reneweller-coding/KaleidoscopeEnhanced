#version 330 core
out vec4 fragColor;
// FeatherStorm.frag — cut a feather out of a quad.
// -----------------------------------------------------------------------
// The silhouette is the whole illusion, and it comes from three things a real
// feather has and a leaf-shaped blob does not:
//
//   * the vane is WIDER past the middle than at the quill, and it comes to a
//     point — a symmetric lens shape reads as a leaf every time;
//   * the two sides are not the same width.  A flight feather's leading vane is
//     visibly narrower than its trailing one, and that asymmetry is most of what
//     tells the eye "feather" before it can name why;
//   * the barbs SEPARATE.  A vane with a clean edge looks like plastic; nicking
//     the outline with the same comb frequency that draws the barbs is what
//     makes it look like keratin.
// -----------------------------------------------------------------------

in vec3  vNormal;
in vec3  vView;
in vec3  vObj;
in vec2  vFeather;      // x = quill..tip, y = -1..1 across

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
uniform float barbP;

vec3 hue2rgb(float h)
{
    return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
}

void main()
{
    float u = clamp(vFeather.x, 0.0, 1.0);
    float v = vFeather.y;

    // Width profile.  sin(pi*u) is the obvious choice and it is symmetric, which
    // is precisely what makes it read as a LEAF: a feather's widest point sits
    // past the middle, closer to the tip, and it narrows toward the quill much
    // faster than it narrows toward the point.  u^0.55 * (1-u)^0.35 peaks at
    // 0.61 and does both; the 1.84 renormalises it back to a maximum of one.
    float w = pow(u, 0.55) * pow(1.0 - u, 0.35) * 1.84;
    w *= smoothstep(0.0, 0.14, u);              // bare shaft at the base

    // The two vanes differ, which is what separates a feather from a leaf.
    float side = (v < 0.0) ? 0.62 : 1.0;
    float halfW = w * side;

    // Barbs: a comb running along the vane, angled toward the tip.
    float barbs = 22.0 + 26.0 * clamp(barbP, 0.0, 1.5);
    float comb = sin((u * 3.1 + abs(v) * 0.55) * barbs);

    // The same comb nicks the outline, so the edge is ragged the way separated
    // barbs are, instead of being a clean curve.
    float edge = halfW * (1.0 - 0.10 * clamp(barbP, 0.0, 1.5) * (0.5 + 0.5 * comb));

    if (abs(v) > edge)
        discard;

    vec3 n = normalize(vNormal);
    vec3 V = normalize(vView);
    if (dot(n, V) < 0.0) n = -n;

    vec3 L  = normalize(vec3(0.32, 0.74, -0.59));
    vec3 L2 = normalize(vec3(-0.70, 0.20, -0.68));

    float hue = fract(0.06 + 0.55 * hueP + 0.13 * u + 0.05 * sin(audioChromaHue));
    vec3 plume = mix(hue2rgb(hue), vec3(1.0), 0.34);

    // A feather is thin enough to be lit from behind, and the light coming
    // through it is the brightest thing about it.  Wrapped lighting stands in
    // for that far better than a diffuse term does.
    float wrap = 0.5 + 0.5 * dot(n, L);
    float trans = pow(clamp(-dot(n, L) * 0.5 + 0.5, 0.0, 1.0), 2.0);

    vec3 col = plume * (0.14 + 0.70 * wrap * wrap);
    col += plume * trans * (0.55 + 0.9 * glowP) * (0.5 + 0.8 * audioLevel);
    col += plume * max(dot(n, L2), 0.0) * vec3(0.35, 0.45, 0.62) * 0.35;

    // The shaft itself: a bright quill down the middle.
    float rachis = 1.0 - smoothstep(0.0, 0.045, abs(v));
    col = mix(col, mix(plume, vec3(1.0), 0.55) * 1.25, rachis * 0.8);

    // Barb shading, so the vane has a grain.
    col *= 0.86 + 0.20 * (0.5 + 0.5 * comb);

    float fres = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 3.0);
    col += hue2rgb(fract(hue + 0.42)) * fres * (0.20 + 0.55 * glowP)
         * (0.4 + 1.0 * audioKick);

    vec3 H = normalize(L + V);
    col += vec3(1.0, 0.98, 0.95) * pow(max(dot(n, H), 0.0), 40.0)
         * (0.25 + 1.3 * audioHigh);

    col += plume * 0.16 * audioAmbient;
    col *= 1.0 + 0.18 * audioBeat + 0.12 * audioSubBass;
    col = col / (1.0 + col * 0.24);
    fragColor = vec4(col, interpolation);
}
