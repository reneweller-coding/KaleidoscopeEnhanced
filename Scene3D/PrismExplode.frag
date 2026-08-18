#version 330 core
out vec4 fragColor;
// PrismExplode.frag — real dispersion, from Cauchy's equation.
// -----------------------------------------------------------------------
// A prism makes a spectrum because glass has a different refractive index for
// every wavelength.  Cauchy's equation is the usual one-line model of that:
//
//     n(lambda) = A + B / lambda^2        (lambda in micrometres)
//
// For a common crown glass A is about 1.52 and B about 0.0045, which puts n at
// 1.532 for blue at 0.45 um and 1.527 for red at 0.65 um.  That difference looks
// tiny, and the reason a prism works at all is that the DEVIATION amplifies it:
// each refraction multiplies the difference, and a wedge sends the ray through
// two of them.
//
// So the three channels are refracted SEPARATELY here, each with its own index,
// and the wedge angle the generator measured scales how far they separate.  A
// thin shard barely tints; a fat one throws a full spectrum.  Sampling the
// environment three times with three directions is the entire effect, and it is
// why this looks like glass rather than like a rainbow gradient painted on.
// -----------------------------------------------------------------------

in vec3  vNormal;
in vec3  vView;
in vec3  vObj;
in float vWedge;
in float vSeed;

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
uniform float dispP;
uniform sampler2D tex1;
uniform float audioAdvance;
uniform float audioValence;        // preset: how strongly the glass disperses

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

// What the shard sees in a given direction.  There is no environment map here,
// so the surroundings are a cheap analytic sky: a bright band overhead, a warm
// floor bounce, and a couple of hot spots that give the glass something to
// catch.
vec3 environment(vec3 d, float hueBase)
{
    float up = d.y * 0.5 + 0.5;
    vec3 sky = mix(vec3(0.10, 0.13, 0.20), vec3(0.75, 0.86, 1.10), up * up);
    sky += vec3(1.05, 0.88, 0.60) * pow(max(-d.y, 0.0), 2.5) * 0.75;

    // Bright bands, and they are not decoration.  Dispersion is only VISIBLE
    // against high-frequency contrast: the three refracted directions differ by
    // a fraction of a degree, so on a smooth gradient all three land on almost
    // the same value and the shard comes out tinted rather than split.  A prism
    // in a featureless white room makes no rainbow either — it needs an edge.
    // These bands are that edge, and they are what turns the wedges into
    // spectra.
    float band = sin(d.y * 17.0 + d.x * 6.5) * 0.5 + 0.5;
    sky += vec3(1.0, 0.95, 0.85) * pow(band, 14.0) * 0.9;

    vec3 key = normalize(vec3(0.42, 0.78, -0.46));
    sky += vec3(1.0, 0.96, 0.90) * pow(max(dot(d, key), 0.0), 90.0) * 6.0;
    vec3 key2 = normalize(vec3(-0.66, 0.18, -0.72));
    sky += hue2rgb(fract(hueBase + 0.45)) * pow(max(dot(d, key2), 0.0), 40.0) * 1.1;
    return sky;
}

void main()
{
    vec3 n = normalize(vNormal);
    vec3 V = normalize(vView);
    if (dot(n, V) < 0.0) n = -n;

    float hueBase = fract(0.55 * hueP + 0.08 * sin(audioChromaHue));

    // Cauchy indices for the three channels.  The spread is exaggerated by the
    // preset and by the shard's wedge, because a physically correct 0.005 would
    // be invisible at this scale.
    float spread = (0.35 + 1.5 * clamp(dispP, 0.0, 2.0))
                 * (0.35 + 0.85 * vWedge)
                 * (0.7 + 0.9 * audioKick + 0.4 * audioSubBass);
    float A = 1.52;
    float nR = A + 0.0045 / (0.65 * 0.65);
    float nG = A + 0.0045 / (0.55 * 0.55);
    float nB = A + 0.0045 / (0.45 * 0.45);
    // Re-centre on green and amplify, so green passes straight and red and blue
    // fan out either side of it — which is what the eye reads as dispersion.
    float kR = 1.0 + (nR - nG) * 150.0 * spread;
    float kG = 1.0;
    float kB = 1.0 + (nB - nG) * 150.0 * spread;

    vec3 I = -V;
    vec3 rR = refract(I, n, 1.0 / (nG * kR));
    vec3 rG = refract(I, n, 1.0 / (nG * kG));
    vec3 rB = refract(I, n, 1.0 / (nG * kB));

    // Total internal reflection returns a zero vector; fall back to the mirror
    // direction so a shard at a grazing angle turns reflective instead of black,
    // which is also what real glass does.
    vec3 mir = reflect(I, n);
    if (dot(rR, rR) < 1e-6) rR = mir;
    if (dot(rG, rG) < 1e-6) rG = mir;
    if (dot(rB, rB) < 1e-6) rB = mir;

    vec3 col;
    col.r = environment(normalize(rR), hueBase).r;
    col.g = environment(normalize(rG), hueBase).g;
    col.b = environment(normalize(rB), hueBase).b;

    // Fresnel: glass is a mirror at grazing incidence and a window head-on.
    float f = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 4.0);
    // Flat facets carry the dispersion split as SOLID complementary
    // colours (candy shards) — blend well toward the unsplit mirror.
    col = mix(col, environment(mir, hueBase), clamp(0.55 + f * 0.35, 0.0, 0.95));

    // Facet edges catch the light: without them a shard is a smooth blob and the
    // shell reads as a cloud rather than as broken glass.
    col += hue2rgb(fract(hueBase + 0.30 + 0.25 * vSeed)) * f
         * (0.25 + 0.8 * glowP) * (0.4 + 1.2 * audioKick);

    col += vec3(0.10, 0.12, 0.18) * audioAmbient;
    col *= 1.0 + 0.22 * audioBeat + 0.14 * audioSubBass;
    col += vec3(1.0) * 0.05 * audioHigh;
    col = col / (1.0 + col * 0.30);
    fragColor = vec4(col, interpolation);
}
