#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file VolcanicBasaltColumnarJointingHexagon.frag
 * @brief VOLCANIC BASALT COLUMNAR JOINTING HEXAGON: Hexagonal columnar jointed basalt terraces
 * (Giant's Causeway / Fingal's Cave). Thermal contraction cracking during slow basaltic lava cooling
 * creates stepped polygonal stone prisms with volcanic fracture magma glow and basalt photo texturing.
 *   audioAdvance -> navigates lava cooling thermal stress fracture propagation & terrace drift
 *   audioKick    -> flashes subsurface molten magma crack decompression bursts
 *   audioSwell   -> thickens basalt column prism cross-section & magma glow radiance
 *   audioCentroid-> shifts basalt mineral (plagioclase/pyroxene/olivine) color spectra
 *
 * Per-activation variety:
 *   columnPitchP  float joint pitch of the causeway, relative to the row
 *                       depth ramp: fine columns .. coarse ones      (0.1..0.4)
 *   columnHeightP float stepped basalt column height contrast (0.4..1.8)
 *   specularP     float basalt stone facet specular gain       (0.8..2.5)
 */

in vec3 vNormal;   ///< Surface normal (from the vertex stage).
in vec3 vCol;   ///< Colour (from the vertex stage).
in float vBasaltGlow;
in float vFog;

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
    
    vec2 photoUv = fract(vNormal.xy * 0.5 + 0.5);
    vec3 photo = img(photoUv);
    
    vec3 col = vCol * (0.6 + 0.4 * photo) * (0.42 + 0.68 * diff);
    col += vec3(0.95, 0.95, 1.0) * min(spec * (1.0 + 3.0 * audioKick), 1.4);
    col += vec3(1.0, 0.45, 0.1) * min(vBasaltGlow * 2.2, 2.6);
    col *= (0.85 + 0.35 * audioSwell);
    col += vCol * (audioKick * 0.3);

    // Cooling haze over the far terraces: the causeway now runs all the way
    // to the top of the frame, and without it the distance reads as a flat
    // wall of identical prisms.
    vec3 hazeCol = vec3(0.17, 0.165, 0.20) * (0.85 + 0.35 * audioSwell);
    col = mix(col, hazeCol, vFog * 0.55);

    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
