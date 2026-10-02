#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).

in vec4  vCol;   ///< Colour (from the vertex stage).
in float vSide;   ///< Which side of a strip (from the vertex stage).
in float vLength;

/**
 * @file CosmicStringHyperspaceWeb.frag
 * @brief Fragment shader for the cosmic-string web ribbons: blends the
 * per-vertex colour with a photo sample scrolling along the ribbon length,
 * then adds a bright edge rim and a hot core beam down the ribbon centre.
 *
 * The scene's audio reactivity (string tension/vibration, kick jolts, swell,
 * hue) is computed upstream in CosmicStringHyperspaceWeb.vert and arrives
 * here baked into vCol; this stage only re-samples the slideshow photo
 * (tex0/tex1, cross-faded by interpolation) using vSide/vLength/time and
 * layers the glow on top.
 */

uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).

/// @brief Entry point of this shader stage (the file description says what it draws).
void main() {
    vec2 uv = vec2(vSide * 0.5 + 0.5, fract(vLength * 4.0 + time * 0.2));
    vec3 photo = (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;

    // String edge glow & core beam
    float edge = smoothstep(0.7, 0.98, abs(vSide));
    float core = exp(-abs(vSide) * 12.0);

    vec3 col = mix(vCol.rgb * 0.6, photo * 1.4, 0.6);
    col += edge * vCol.rgb * 1.5;
    col += core * vec3(1.0, 1.0, 1.0) * 1.8;

    fragColor = vec4(col, 1.0);
}
