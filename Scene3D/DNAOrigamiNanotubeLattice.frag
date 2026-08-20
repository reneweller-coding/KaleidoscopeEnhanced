#version 330 core
out vec4 fragColor;
/**
 * @file DNAOrigamiNanotubeLattice.frag
 * @brief DNA ORIGAMI NANOTUBE LATTICE: Bionanotechnological self-assembled 4-helix bundle DNA
 * origami nanotubes -- ten of them on a slowly turning ring lattice, each at its own
 * depth in the culture so the near bundles are lit and the far ones sink into the medium.
 * Interweaving phosphoribosyl double helices, staple strand crossovers,
 * Cy5/Cy3 fluorophore tagging pulses, and biomolecular photo texturing.
 *   audioAdvance -> drives DNA helicoidal rotation & molecular conformational dynamics
 *   audioKick    -> flashes fluorophore Förster resonance energy transfer (FRET) bursts
 *   audioSwell   -> thickens DNA phosphate backbone ribbon width & hydration shell glow
 *   audioCentroid-> shifts fluorophore emission spectra (Cy3 green to Cy5 red)
 *
 * Per-activation variety:
 *   ribbonWidthP float DNA backbone ribbon thickness         (0.02..0.08)
 *   fretGlowP    float fluorophore FRET emission luminance   (0.8..2.5)
 */

in vec2 vUV;
in float vSide;
in float vRibbonID;
in vec3 vCol;
in float vFluorPulse;
in float vDepthShade;

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioKick;
uniform float audioSwell;

uniform float fretGlowP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

void main()
{
    // Cross-section of one duplex: a bright phosphate backbone down the axis,
    // two staple-crossover rails either side of it, and the hydration shell
    // out to the edge of the quad.  The backbone runs over the WHOLE quad --
    // confining it to the middle 38% and masking the fluorophore beads with it
    // is what made this scene 4x too dark for the light it actually draws.
    float s     = abs(vSide);
    float core  = pow(max(0.0, 1.0 - s), 2.2);
    float edge  = exp(-abs(s - 0.62) * 9.0);
    float shell = exp(-s * 1.6) * 0.20;

    vec3 photo = img(vUV);

    // The duplex carries its own Cy3/Cy5 stain as well as the photo palette:
    // the scene has to stay legible over a near-black photo too, and the stain
    // is what keeps a floor under the backbone when the palette has none.
    vec3 body = mix(vCol, vec3(0.72, 0.82, 1.0) * 0.55, 0.40);

    vec3 col = body * (0.6 + 0.4 * photo) * core * 1.6;

    // FRET beads. fretGlowP is compressed into 1.05..1.76: at its raw 0.8 end
    // the beads -- this scene's only real highlight -- dropped below the
    // measuring floor and took the contrast with them.
    float fret = 1.05 + 0.42 * (clamp((fretGlowP > 0.01 ? fretGlowP : 1.4), 0.8, 2.5) - 0.8);
    col += vec3(0.95, 0.95, 1.0) * vFluorPulse * fret * 2.2 * (0.42 + 0.58 * core);

    col += body * edge * 1.5;
    col += body * shell * (0.85 + 0.55 * audioSwell);

    // Per-bundle depth shading from the .vert: near bundles lit, far bundles
    // dark.  Applied to everything the strand emits, so the light/dark
    // separation survives the additive stacking.
    col *= vDepthShade;

    col *= (0.85 + 0.35 * audioSwell);
    col += body * (audioKick * 0.3) * core;

    // additive pass dim: this geom renders GL_ONE/GL_ONE without depth --
    // overlapping layers ADD, so each fragment must stay well below 1.0 or the
    // stack burns to white.  Cap the COLOUR-TINTED vec3, not the scalar.
    col = min(col * 0.50, vec3(1.30));

    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
