#version 330 core
out vec4 fragColor;
/**
 * @file CosmicWebFilamentAnisotropy.frag
 * @brief COSMIC WEB FILAMENT ANISOTROPY: 60,000-particle large-scale dark matter structure.
 * Intersecting cosmic web filaments connect massive galaxy cluster nodes with soft halo glow,
 * gravitational lens distortions, and photo-derived cosmological spectra.
 *   audioAdvance -> drives cosmic expansion & large-scale structure flow
 *   audioKick    -> flashes gravitational cluster merger shockwaves
 *   audioSwell   -> enriches cosmic void background illumination
 *   audioCentroid-> shifts dark matter halo potential well colors
 *
 * Per-activation variety:
 *   pointGainP float particle luminosity gain              (0.5..1.8)
 *   haloP      float cluster node halo brightness           (0.6..2.2)
 */

in vec3 vCol;
in float vDensity;

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
    
    float spriteGlow = exp(-r2 * 3.5);
    
    // Controlled brightness per Rule V8c (base brightness <= 0.1 to avoid blowout)
    float baseLuma = 0.06 * (pointGainP > 0.01 ? pointGainP : 1.0);
    vec3 col = vCol * spriteGlow * (baseLuma + 0.08 * vDensity) * (0.8 + 0.4 * audioSwell);
    col += vCol * (vDensity * 0.08) * (haloP > 0.01 ? haloP : 1.0) * (audioKick * 1.5);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
