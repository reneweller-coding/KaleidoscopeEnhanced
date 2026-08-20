#version 330 core
out vec4 fragColor;
// SuperconductingFluxVortex.frag

uniform vec2  resolution;
uniform float time;
uniform float audioChromaHue;
uniform float hueP;

in vec4  vColor;
in vec2  vTexCoord;
in float vHaze;

/**
 * @file SuperconductingFluxVortex.frag
 * @brief Shades the two primitive families of the superconducting vortex
 * lattice: the flux-tube ribbons (a glowing core fading toward the ribbon's
 * edges, per-vertex cyan flux line / violet Cooper-pair / green Meissner
 * tint mixed in the vertex stage) and the soft round motes of the expelled
 * Meissner field that fill the far background.  vHaze tells the two apart.
 *
 * Only audioChromaHue and the hueP preset are read here, rotating the whole
 * picture's colour; the underlying vortex colour mix, its rotation, and its
 * audioKick/audioLevel-driven brightness are computed in the companion
 * vertex shader (SuperconductingFluxVortex.vert). distFromCenter (from
 * vTexCoord.x) shapes the glowing core profile across the ribbon's width.
 *
 * This pass is drawn OPAQUE and depth-tested (geom="indirect"), so a
 * fragment that is nearly black still writes depth and would punch a hole in
 * whatever sits behind it -- hence the discard on the haze motes' faded rim.
 */

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    float hue = (hueP > 0.0) ? hueP : 0.0;

    vec3 col;
    if (vHaze > 0.5)
    {
        // Soft round mote; the rim is discarded rather than drawn black so
        // the motes overlap as a haze instead of as opaque discs.
        vec2  d = vTexCoord * 2.0 - 1.0;
        float a = exp(-dot(d, d) * 2.6);
        if (a < 0.10) discard;
        col = vColor.rgb * a;
    }
    else
    {
        // Glowing flux tube core profile.  The falloff is gentler than the
        // original exp(-d*4.5): that lit barely the centre line of an already
        // hair-thin ribbon and let the rest read as black.
        float distFromCenter = abs(vTexCoord.x - 0.5) * 2.0;
        float fluxGlow = exp(-distFromCenter * 2.2);
        col = vColor.rgb * fluxGlow * 1.25;
    }

    col = hueRot(col, audioChromaHue + hue);
    // Cap the TINTED colour, not the scalar that fed it.
    fragColor = vec4(min(max(col, vec3(0.0)), vec3(1.0)), 1.0);
}
