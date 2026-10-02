#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
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

in vec3 vCol;   ///< Colour (from the vertex stage).
in float vPhononAmp;

uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).

uniform float pointGainP;
uniform float haloP;

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    // Radial sprite falloff (GL_POINTS only)
    vec2 pt = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(pt, pt);
    if (r2 > 1.0) discard;
    
    float spriteGlow = exp(-r2 * 4.0);
    
    // Controlled brightness per Rule V8c
    float baseLuma = 0.60 * (pointGainP > 0.01 ? pointGainP : 1.0);   // round 2: knee compression
    vec3 col = vCol * spriteGlow * (baseLuma + 0.08 * vPhononAmp) * (0.85 + 0.35 * audioSwell);
    col += vCol * (vPhononAmp * 0.08) * (haloP > 0.01 ? haloP : 1.0) * (audioKick * 1.5);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
