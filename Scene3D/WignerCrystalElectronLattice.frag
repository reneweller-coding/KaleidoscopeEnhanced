#version 330 core
out vec4 fragColor;
/**
 * @file WignerCrystalElectronLattice.frag
 * @brief WIGNER CRYSTAL ELECTRON LATTICE: Triangular 2D/3D quantum electron crystal
 * formed by pure Coulomb repulsion at ultralow temperatures. Zero-point quantum fluctuations,
 * propagating acoustic phonon waves, and photo-palette dispersion halos.
 *   audioAdvance -> propagates phonon acoustic wave modes across the crystal
 *   audioKick    -> excites quantum melting fluctuation bursts
 *   audioSwell   -> widens electron wavepacket cloud halo
 *   audioCentroid-> shifts phonon dispersion branch colors
 *
 * Per-activation variety:
 *   pointGainP float electron point brightness             (0.5..1.8)
 *   haloP      float quantum wavepacket halo brightness     (0.6..2.2)
 */

in vec3 vCol;
in float vPhononAmp;

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioKick;
uniform float audioSwell;

uniform float pointGainP;
uniform float haloP;

void main()
{
    // Radial sprite falloff (GL_POINTS only)
    vec2 pt = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(pt, pt);
    if (r2 > 1.0) discard;
    
    float spriteGlow = exp(-r2 * 4.0);
    
    // Controlled brightness per Rule V8c
    float baseLuma = 0.07 * (pointGainP > 0.01 ? pointGainP : 1.0);
    vec3 col = vCol * spriteGlow * (baseLuma + 0.08 * vPhononAmp) * (0.85 + 0.35 * audioSwell);
    col += vCol * (vPhononAmp * 0.08) * (haloP > 0.01 ? haloP : 1.0) * (audioKick * 1.5);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
