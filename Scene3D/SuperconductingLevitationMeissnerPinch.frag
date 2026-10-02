#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file SuperconductingLevitationMeissnerPinch.frag
 * @brief SUPERCONDUCTING LEVITATION MEISSNER PINCH: an ARRAY of eight levitation cells -- stable
 * magnetic levitation via the Meissner-Ochsenfeld effect and flux pinning over high-Tc YBCO discs,
 * each on a wide cryostat cold plate whose rim meets its neighbours', so the bed spans the frame.
 * Expelled magnetic flux lines, fluxon vortex pinning channels, metallic mirror sheen, and cryogenic
 * photo texturing.
 *   audioAdvance -> navigates magnetic flux pinning creep & levitating magnet precession
 *   audioKick    -> flashes magnetic flux expulsion compression & quantum pinning bursts
 *   audioSwell   -> widens magnetic levitation gap distance & superconducting diamagnetic glow
 *   audioCentroid-> shifts YBCO superconducting transition & diamagnetic color spectra
 *
 * Per-activation variety:
 *   diskScaleP float superconductor disk scale, remapped to a narrow band now
 *              that eight assemblies share the frame       (0.8..2.2)
 *   specularP  float permanent magnet facet specular gain  (0.8..2.5)
 */

in vec2 vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
in vec3 vNormal;   ///< Surface normal (from the vertex stage).
in vec3 vCol;   ///< Colour (from the vertex stage).
in float vMeissnerGlow;

uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).

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
    
    vec3 photo = img(vUV);
    
    // Fluxon vortex pinning channels: an Abrikosov lattice creeping across the
    // superconductor's face. Constant coefficients on `time` (anti-flicker safe),
    // ~0.3 Hz, and it is the fine surface detail the header promises but that the
    // shading never actually drew.
    float fx = sin(vUV.x * 44.0 + time * 0.9) * sin(vUV.y * 26.0 - time * 0.7);
    float fluxon = 0.72 + 0.28 * fx;

    vec3 col = vCol * (0.6 + 0.4 * photo) * (0.4 + 0.6 * diff) * fluxon;
    col += vec3(0.95, 0.95, 1.0) * min(spec * (1.0 + 3.0 * audioKick), 1.6);
    col += min(vec3(0.2, 0.85, 1.0) * vMeissnerGlow * 2.2, vec3(0.35, 1.10, 1.30));
    col *= (0.85 + 0.35 * audioSwell);
    col += vCol * (audioKick * 0.3);

    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
