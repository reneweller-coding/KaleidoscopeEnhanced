#version 330 core
out vec4 fragColor;
/**
 * @file QuasicrystalPenroseRhomb3D.frag
 * @brief QUASICRYSTAL PENROSE RHOMB 3D: 3D icosahedral Penrose quasicrystal (Ammann-Kramer-Neri tiling).
 * Rhombohedral building blocks with 5-fold non-crystallographic aperiodic order, Bragg diffraction
 * glints, golden ratio shell scaling, and photo texturing.
 *   audioAdvance -> rotates 6D-to-3D projection slice & aperiodic phason dynamics
 *   audioKick    -> flashes 5-fold Bragg diffraction specular reflections
 *   audioSwell   -> thickens rhombohedron crystal facet cross-section & sheen
 *   audioCentroid-> shifts aperiodic quasi-lattice color spectra
 *
 * Per-activation variety:
 *   cubeSizeP float rhombohedral crystal facet size          (0.03..0.12)
 *   specularP float quasicrystal facet specular highlight    (0.8..2.5)
 */

in vec3 vNormal;
in vec3 vCol;
in float vQuasiShell;
in vec3 vLocalPos;

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioKick;
uniform float audioSwell;

uniform float specularP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

void main()
{
    vec3 lightDir = normalize(vec3(0.5, 0.6, 0.7));
    float diff = max(0.0, dot(vNormal, lightDir));
    float spec = pow(max(0.0, dot(reflect(-lightDir, vNormal), vec3(0.0, 0.0, 1.0))), 24.0) * (specularP > 0.01 ? specularP : 1.2);
    
    vec3 aPos = abs(vLocalPos);
    float edgeGlow = smoothstep(0.42, 0.5, max(max(aPos.x, aPos.y), aPos.z));
    
    vec2 photoUv = fract(vLocalPos.xy * 2.0 + 0.5);
    vec3 photo = img(photoUv);
    
    vec3 col = vCol * (0.6 + 0.4 * photo) * (0.4 + 0.6 * diff);
    col += vec3(0.95, 0.95, 1.0) * spec * (1.0 + 3.0 * audioKick);
    col += vCol * edgeGlow * 1.5;
    col *= (0.85 + 0.35 * audioSwell);
    col += vCol * (audioKick * 0.3);

    // Shell depth cue.  vQuasiShell (the rhomb's distance from the lattice
    // centre) was passed through and never read; with the whole 4900-cube
    // lattice now drawing, the inner shells would otherwise be buried in an
    // undifferentiated mass.  Outer shells sit back a stop, which is both the
    // depth read and the guard against the dense core over-exposing.
    // 0.68, not 0.55: most of a sqrt-distributed ball IS the outer shells, so
    // the old figure was really a global -45% exposure on a frame that already
    // measured luma 0.011.
    col *= mix(1.0, 0.68, clamp(vQuasiShell / 3.8, 0.0, 1.0));

    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
