#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file DielectricResonatorMetagrating.frag
 * @brief DIELECTRIC RESONATOR METAGRATING: 2D array of resonant high-refractive-index silicon
 * dielectric nanopillars. High-Q electric and magnetic Mie dipole resonances, polarimetric phase
 * retardation, diffraction beam splitting, and photo-derived optical texturing.
 *   audioAdvance -> navigates dielectric polarimetric phase wavefront translation
 *   audioKick    -> flashes high-Q Mie dipole resonance optical transmission bursts
 *   audioSwell   -> thickens silicon nanopillar cross-section & dielectric field glow
 *   audioCentroid-> shifts Mie resonance optical transmission wavelength spectra
 *
 * Per-activation variety:
 *   mieGlowP  float Mie dipole resonance field luminance (0.8..2.5)
 *   specularP float silicon facet specular reflectivity  (0.8..2.2)
 */

in vec2 vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
in vec3 vNormal;   ///< Surface normal (from the vertex stage).
in vec3 vCol;   ///< Colour (from the vertex stage).
in float vMieResonance;

uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).

uniform float mieGlowP;
uniform float specularP;   ///< Specular knob, 0..1.

/// @brief The photo at a coordinate: the cross-fade of tex0 and tex1.
vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vec3 lightDir = normalize(vec3(0.5, 0.6, 0.7));
    float diff = max(0.0, dot(vNormal, lightDir));
    float spec = pow(max(0.0, dot(reflect(-lightDir, vNormal), vec3(0.0, 0.0, 1.0))), 24.0) * (specularP > 0.01 ? specularP : 1.2);

    vec2 p = vUV * 2.0 - 1.0;
    float edgeGlow = exp(-abs(max(abs(p.x), abs(p.y)) - 0.88) * 16.0);

    vec3 photo = img(vUV);

    vec3 col = vCol * (0.6 + 0.4 * photo) * (0.4 + 0.6 * diff);
    col += vec3(0.95, 0.95, 1.0) * spec * (1.0 + 3.0 * audioKick);
    col += vCol * vMieResonance * (mieGlowP > 0.01 ? mieGlowP : 1.3) * 1.5;
    col += vCol * edgeGlow * 1.4;
    col *= (0.85 + 0.35 * audioSwell);
    col += vCol * (audioKick * 0.3);

    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    col *= 2.66;   // measured-dark lift (visual pass)
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
