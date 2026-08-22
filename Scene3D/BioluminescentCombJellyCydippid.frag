#version 330 core
out vec4 fragColor;
/**
 * @file BioluminescentCombJellyCydippid.frag
 * @brief BIOLUMINESCENT COMB JELLY CYDIPPID: Abyssal ctenophore (Mertensia ovum / Beroe cucumis).
 * A BLOOM of five animals drifting at different depths, each carrying 20 meridional rows of
 * coordinated metachronal beating ciliated comb plates (ctenes) producing rainbow diffraction
 * iridescence, bioelectric green fluorescent flashes, and photo texturing -- with the long
 * sticky tentacles trailing off past the edges of the picture between them.
 *   audioAdvance -> accelerates metachronal ciliary comb plate beating wave speed
 *   audioKick    -> flashes defensive coelenterazine bioluminescent shock pulses
 *   audioSwell   -> thickens gelatinous mesoglea body volume & refraction glow
 *   audioCentroid-> shifts ctenophore diffraction rainbow & GFP emission spectra
 *
 * Per-activation variety:
 *   ribbonWidthP float comb plate row ribbon width          (0.02..0.1)
 *   cteneGlowP   float metachronal ciliary wave luminance    (0.8..2.5)
 */

in vec2 vUV;
in float vSide;
in float vRibbonID;
in vec3 vCol;
in float vCiliaWave;

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioKick;
uniform float audioSwell;
uniform float audioAdvance;

uniform float cteneGlowP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

void main()
{
    float core = pow(1.0 - abs(vSide), 2.2);
    float edge = exp(-abs(abs(vSide) - 0.9) * 14.0);

    vec3 photo = img(vUV);

    vec3 col = vCol * (0.6 + 0.4 * photo) * core * 1.8;
    // The comb-plate crest is the brightest thing in the scene and the kick
    // drives it hard; with a whole bloom on screen the crests would otherwise
    // stack up into white.  Cap the additive term (a scalar cap is enough
    // here -- the tint below is under 1.0 in every channel).
    float glow = (cteneGlowP > 0.01 ? cteneGlowP : 1.4);
    // The comb rows are diffraction gratings: the beating plates scatter a
    // SPECTRUM that scrolls along the row.  The old flat white here is what
    // turned the whole animal monochrome on screen.
    float sh = fract(vUV.x * 2.2 + vCiliaWave * 0.15 + audioAdvance * 0.08);
    vec3 spectral = clamp(vec3(abs(sh * 6.0 - 3.0) - 1.0,
                               2.0 - abs(sh * 6.0 - 2.0),
                               2.0 - abs(sh * 6.0 - 4.0)), 0.0, 1.0);
    spectral = mix(vec3(0.9), spectral, 0.85);
    col += spectral * min(vCiliaWave * glow * 1.7, 2.0);
    col += vCol * edge * 1.5;
    col *= (0.85 + 0.35 * audioSwell);
    col += vCol * (audioKick * 0.3);

    // additive pass dim: this geom renders GL_ONE/GL_ONE without
    // depth -- overlapping layers ADD, so each fragment must stay
    // well below 1.0 or the stack burns to white.
    col *= 0.4;

    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
