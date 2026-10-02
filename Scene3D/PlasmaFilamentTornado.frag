#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
// PlasmaFilamentTornado.frag

uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

in vec4 vColor;
in vec2 vTexCoord;   ///< Texture coordinate (from the vertex stage).

/**
 * @file PlasmaFilamentTornado.frag
 * @brief Shades one strand segment of the plasma-filament tornado as a
 * glowing cross-section profile, brightest along the strand's centre
 * line and fading toward its edges.
 *
 * The per-strand cyan/violet/white colour mix and its audio-reactive
 * brightness (audioKick, audioLevel) are computed upstream in
 * PlasmaFilamentTornado.vert and arrive here as vColor; this shader
 * applies a further hueRot() driven directly by audioChromaHue plus the
 * hueP preset before shaping the glow with vTexCoord.
 */

/// @brief Rotates a colour's hue by an angle (about the grey axis).
vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main() {
    float hue = (hueP > 0.0) ? hueP : 0.0;

    // Glowing filament core cross-section profile
    float distFromCenter = abs(vTexCoord.x - 0.5) * 2.0;
    float filamentGlow = exp(-distFromCenter * 4.0);

    vec3 col = vColor.rgb * filamentGlow * 1.5;

    col = hueRot(col, audioChromaHue + hue);
    fragColor = vec4(col, 1.0);
}
