#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file InterstellarMHDShockFront.frag
 * @brief INTERSTELLAR MHD SHOCK FRONT: 3D tessellated stellar wind bow shock front
 * impacting a dense interstellar molecular cloud. Magnetohydrodynamic ripples, compression
 * heating, emission lines, and dynamic photo-palette reflection sheets.
 *   audioAdvance -> drives supersonic stellar wind flow velocity
 *   audioKick    -> flashes bow shock compression boundary detonations
 *   audioSwell   -> thickens interstellar molecular cloud emission haze
 *   audioCentroid-> shifts ionization front emission spectra
 *
 * Per-activation variety:
 *   shockCurvP float bow shock paraboloid curvature           (0.2..0.8)
 *   mhdWaveP   float Kelvin-Helmholtz ripple wavenumber       (4.0..16.0)
 *   nebulaP    float interstellar gas opacity & luminance     (0.8..2.5)
 */

in vec2 vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
in vec3 vNormal;   ///< Surface normal (from the vertex stage).
in vec3 vCol;   ///< Colour (from the vertex stage).
in float vShock;

uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).

uniform float nebulaP;

/// @brief The photo at a coordinate: the cross-fade of tex0 and tex1.
vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vec3 lightDir = normalize(vec3(0.0, 0.0, 1.0));
    float diff = max(0.0, dot(vNormal, lightDir));
    float fresnel = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 3.0);

    vec3 photo = img(vUV);

    vec3 col = vCol * (0.6 + 0.4 * photo) * (0.5 + 0.5 * diff);
    col += vCol * fresnel * 1.8;
    col += vec3(0.9, 0.95, 1.0) * vShock * 2.0;
    col *= (nebulaP > 0.01 ? nebulaP : 1.2) * (0.85 + 0.35 * audioSwell);
    col += vCol * (audioKick * 0.3);

    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    col /= 1.0 + 0.60 * max(col.r, max(col.g, col.b));   // peak knee: tame local glare, keep midtones
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
