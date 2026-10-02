#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).

in vec4  vCol;   ///< Colour (from the vertex stage).
in float vSide;   ///< Which side of a strip (from the vertex stage).
in float vLength;

/**
 * @file FiberopticLightLoom.frag
 * @brief Shades a woven bundle of fiber-optic strands: each strand's
 * cross-section (vSide) blends its per-vertex color with a slideshow photo
 * that scrolls lengthwise along the strand (vLength, animated by time), and
 * a bright rim picks out the strand's outer edge.
 *
 * This fragment stage declares no audio uniforms itself; any audio-driven
 * brightness arrives already baked into the per-vertex vCol supplied by the
 * companion vertex shader. A soft-knee tone-mapping pass at the end
 * compresses hot highlights instead of clipping them to flat white.
 */

uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).

/// @brief Entry point of this shader stage (the file description says what it draws).
void main() {
    vec2 uv = vec2(vSide * 0.5 + 0.5, fract(vLength * 4.0 + time * 0.25));
    vec3 photo = (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;

    float edge = smoothstep(0.7, 0.98, abs(vSide));
    vec3 col = mix(vCol.rgb * 0.55, photo * 1.35, 0.65);
    col += edge * vCol.rgb * 1.7;

    // Catalogue review: soft-knee exposure — hot audio compresses
    // instead of clipping the whole frame to white.
    vec3 _catTone = (col) * 0.6;
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
