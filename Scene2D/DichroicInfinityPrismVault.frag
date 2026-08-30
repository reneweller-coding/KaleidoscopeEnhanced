#version 330 core
out vec4 fragColor;
/**
 * @file DichroicInfinityPrismVault.frag
 * @brief DICHROIC INFINITY PRISM VAULT: Raymarched infinite mirror chamber of
 * dichroic glass prisms and cubic beam-splitters. RGB spectral dispersion,
 * total internal reflection (TIR), multi-bounce optical caustics, and
 * continuous kaleidoscopic photo refraction.
 *   audioAdvance -> navigates camera through the infinite prism vault
 *   audioKick    -> flashes total internal reflection facet edges & glints
 *   audioBass    -> pulses dichroic thin-film transmission wavelength
 *   audioChromaHue-> shifts spectral dispersion prism angles
 *
 * Per-activation variety:
 *   prismP      float prism lattice density & facet scale (0.5..2.2)
 *   dispersionP float chromatic RGB separation spread     (0.5..2.2)
 *   speedP      float camera traversal velocity           (0.5..2.0)
 *   hueP        float dichroic filter base hue offset     (0..6.28)
 */

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioPhase;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioKick;
uniform float audioCentroid;
uniform float audioValence;
uniform float audioSubBass;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioFlux;
uniform float audioChromaHue;

uniform float prismP;
uniform float dispersionP;
uniform float speedP;
uniform float hueP;

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

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

mat2 rot2D(float a) {
    float c = cos(a), s = sin(a);
    return mat2(c, -s, s, c);
}

void main() {
    float prs = (prismP      > 0.0) ? prismP      : 1.0;
    float dsp = (dispersionP > 0.0) ? dispersionP : 1.0;
    float spd = (speedP      > 0.0) ? speedP      : 1.0;
    float hue = (hueP        > 0.0) ? hueP        : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float t = time * 0.3 * spd + audioAdvance * 0.15;

    // Raymarching camera through infinite prism vault
    // Fluss halbiert (Nutzer: "zu schnell").
    vec3 ro = vec3(t * 0.7, sin(t * 0.5) * 0.4, cos(t * 0.4) * 0.4);
    vec3 rd = normalize(vec3(uv, 1.2));   // Kick-FOV-Pumpen entfernt

    rd.yz = rot2D(sin(t * 0.3) * 0.3) * rd.yz;
    rd.xy = rot2D(t * 0.1) * rd.xy;

    vec3 p = ro;
    float edgeAccum = 0.0;
    float bounceCount = 0.0;
    vec2 uvSample = vec2(0.0);

    for (int i = 0; i < 42; ++i) {
        p += rd * 0.07;

        // Infinite cubic / octahedral prism lattice
        vec3 cellP = fract(p * 0.8 * prs) - 0.5;
        vec3 absP = abs(cellP);

        // Chamfered prism edges & corner cuts
        float boxDist = max(max(absP.x, absP.y), absP.z) - 0.35;
        float octDist = (absP.x + absP.y + absP.z - 0.55) * 0.577;
        float prismDist = max(boxDist, octDist);

        if (prismDist < 0.05) {
            // Prism edge glow
            float edge = exp(-abs(prismDist) * 35.0);
            edgeAccum += edge * 0.05;
            bounceCount += 1.0;

            // Optical refraction reflection bounce
            vec3 n = normalize(cellP);
            rd = reflect(rd, n);
            uvSample = fract(cellP.xy * 2.0 + 0.5);
        }
    }

    // Chromatic RGB dispersion sampling
    float dispSpread = 0.02 * dsp * (1.0 + audioKick * 0.8);
    vec3 photoR = img(fract(st + vec2(dispSpread, 0.0)));
    vec3 photoG = img(fract(st));
    vec3 photoB = img(fract(st - vec2(dispSpread, 0.0)));
    vec3 photo = vec3(photoR.r, photoG.g, photoB.b);

    // Dichroic thin-film interference colors (cyan, magenta, gold)
    vec3 dichroic = imgPalette((bounceCount * 0.4 + audioPhase) * 0.159);

    // Diamond specular glints on kick
    // Kompakter Zentrums-Glint statt des bildschirmbreiten weissen Kreuzes.
    float glint = exp(-(abs(uv.x) + abs(uv.y)) * 6.0) * (audioKick * 1.5 + audioHigh * 0.6);

    // Combine visualizer
    vec3 col = mix(photo * 0.85, dichroic, 0.45 + 0.2 * audioSwell);
    col += edgeAccum * vec3(0.3, 0.9, 1.0) * (1.2 + audioKick * 2.5);
    col += glint * vec3(1.0, 0.98, 0.9);

    if (audioChromaHue != 0.0)     if (hue > 0.001) col = hueRot(col, hue);

    // Vignette
    float vig = smoothstep(1.3, 0.35, length(uv));
    col *= vig;

    // Catalogue review: soft-knee exposure — hot audio compresses
    // instead of clipping the whole frame to white.
    vec3 _catTone = (col) * 0.65;
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
