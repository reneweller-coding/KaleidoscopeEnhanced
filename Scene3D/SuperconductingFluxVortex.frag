#version 330 core
out vec4 fragColor;
// SuperconductingFluxVortex.frag

uniform vec2  resolution;
uniform float time;
uniform float audioChromaHue;
uniform float hueP;

in vec4 vColor;
in vec2 vTexCoord;

/**
 * @file SuperconductingFluxVortex.frag
 * @brief Shades one flux-tube ribbon of a superconducting vortex lattice as
 * a glowing core that fades toward its edges, using a per-vertex colour
 * (cyan flux line / violet Cooper-pair / green Meissner-effect tint, mixed
 * in the vertex stage) supplied via vColor.
 *
 * Only audioChromaHue and the hueP preset are read here, rotating the whole
 * tube's colour; the underlying vortex colour mix, its rotation, and its
 * audioKick/audioLevel-driven brightness are computed in the companion
 * vertex shader (SuperconductingFluxVortex.vert). distFromCenter (from
 * vTexCoord.x) shapes the glowing core profile across the ribbon's width.
 */

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    float hue = (hueP > 0.0) ? hueP : 0.0;

    // Glowing flux tube core profile
    float distFromCenter = abs(vTexCoord.x - 0.5) * 2.0;
    float fluxGlow = exp(-distFromCenter * 4.5);

    vec3 col = vColor.rgb * fluxGlow * 1.5;

    col = hueRot(col, audioChromaHue + hue);
    fragColor = vec4(col, 1.0);
}
