#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file KelvinWakeShipWavePattern.frag
 * @brief KELVIN WAKE SHIP WAVE PATTERN: 220x120 heightfield grid of the classical hydrodynamic
 * Kelvin ship wake pattern. Divergent and transverse wave systems bounded by the universal
 * 19.47-degree Mach wedge, foamy crest highlights, specular ocean sheen, and photo texturing.
 *   audioAdvance -> propels ship wake propagation & hydrodynamic phase velocity
 *   audioKick    -> flashes wave crest foam cavitation & whitecap glints
 *   audioSwell   -> enriches wave amplitude & ocean surface caustic depth
 *   audioCentroid-> shifts water transmission & atmospheric reflection spectra
 *
 * Per-activation variety:
 *   waveScaleP float Kelvin wave train spatial frequency     (0.6..2.2)
 *   foamGlowP  float wave crest whitecap foam luminance     (0.8..2.5)
 *   specularP  float water surface specular highlight gain   (0.8..2.5)
 */

in vec2 vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
in vec3 vNormal;   ///< Surface normal (from the vertex stage).
in vec3 vCol;   ///< Colour (from the vertex stage).
in float vCrestGlow;

uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).

uniform float foamGlowP;
uniform float specularP;   ///< Specular knob, 0..1.

/// @brief The photo at a coordinate: the cross-fade of tex0 and tex1.
vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vec3 lightDir = normalize(vec3(0.3, 0.6, 0.7));
    float diff = max(0.0, dot(vNormal, lightDir));
    float spec = pow(max(0.0, dot(reflect(-lightDir, vNormal), vec3(0.0, 0.0, 1.0))), 28.0) * (specularP > 0.01 ? specularP : 1.3);
    
    vec3 photo = img(vUV);
    
    vec3 col = vCol * (0.6 + 0.4 * photo) * (0.4 + 0.6 * diff);
    col += vec3(0.95, 0.95, 1.0) * spec * (1.0 + 3.0 * audioKick);
    col += vec3(0.85, 0.95, 1.0) * vCrestGlow * (foamGlowP > 0.01 ? foamGlowP : 1.3) * 1.8;
    col *= (0.85 + 0.35 * audioSwell);
    col += vCol * (audioKick * 0.3);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
