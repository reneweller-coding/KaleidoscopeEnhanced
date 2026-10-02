#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file BismuthFerriteMultiferroicDomains.frag
 * @brief BISMUTH FERRITE MULTIFERROIC DOMAINS: 3D quad terraces of multiferroic domain walls
 * in BiFeO3. Displays cross-coupled ferroelectric polarization terraces, conductive domain wall
 * channels, metallic ceramic reflections, and photo texturing.
 *   audioAdvance -> switches ferroelectric domain wall polarization states
 *   audioKick    -> flashes conductive domain wall nano-channel current pulses
 *   audioSwell   -> thickens multiferroic terrace step height & ceramic sheen
 *   audioCentroid-> shifts polarization domain color spectra
 *
 * Per-activation variety:
 *   stepHeightP  float domain terrace step elevation        (0.04..0.18)
 *   channelGlowP float conductive domain wall edge luminance (0.8..2.5)
 *   specularP    float perovskite ceramic specular sheen     (0.8..2.2)
 */

in vec2 vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
in vec3 vNormal;   ///< Surface normal (from the vertex stage).
in vec3 vCol;   ///< Colour (from the vertex stage).
in float vDomainType;

uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).

uniform float channelGlowP;
uniform float specularP;   ///< Specular knob, 0..1.

/// @brief The photo at a coordinate: the cross-fade of tex0 and tex1.
vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    // Quad edge conductive channel detection
    vec2 edgeUv = abs(vUV * 2.0 - 1.0);
    float edgeDist = max(edgeUv.x, edgeUv.y);
    float channelGlow = smoothstep(0.82, 0.98, edgeDist) * (channelGlowP > 0.01 ? channelGlowP : 1.2);

    vec3 lightDir = normalize(vec3(0.4, 0.6, 0.7));
    float diff = max(0.0, dot(vNormal, lightDir));
    float spec = pow(max(0.0, dot(reflect(-lightDir, vNormal), vec3(0.0, 0.0, 1.0))), 24.0) * (specularP > 0.01 ? specularP : 1.2);

    vec3 photo = img(vUV);

    vec3 col = vCol * (0.6 + 0.4 * photo) * (0.5 + 0.5 * diff);
    col += vec3(0.9, 0.95, 1.0) * channelGlow * (1.0 + 3.0 * audioKick);
    col += vec3(1.0, 0.95, 0.8) * spec;
    col *= (0.85 + 0.35 * audioSwell);
    col += vCol * (audioKick * 0.3);

    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    col *= 2.35;   // measured-dark lift (visual pass)
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
