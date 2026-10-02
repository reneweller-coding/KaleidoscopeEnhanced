#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).

in vec3 vPos;   ///< Position (from the vertex stage).
in float vCirc;
in float vRingID;

/**
 * @file SuperfluidVortexTangle.frag
 * @brief Draws a tangle of quantized superfluid vortex rings as glowing
 * point sprites, blending a deep-ocean-blue-to-electric-cyan/emerald
 * circulation colour with a faint reflection of the current slideshow photo.
 *
 * vCirc (local circulation, from the vertex stage) drives a pulsing core
 * glow that brightens toward white; vRingID cycles the base circulation hue
 * over time; audioKick punches overall brightness (scaled by the vortexP
 * preset), and audioChromaHue plus hueP rotate the final colour. A
 * soft-knee tone map keeps hot audio from clipping to flat white.
 */

uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).

uniform float glowP;   ///< Glow / afterglow knob, 0..1.
uniform float vortexP;
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

/// @brief The photo at a coordinate: the cross-fade of tex0 and tex1.
vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

/// @brief Rotates a colour's hue by an angle (about the grey axis).
vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main() {
    float glw = (glowP    > 0.0) ? glowP    : 1.0;
    float vtx = (vortexP  > 0.0) ? vortexP  : 1.0;
    float hue = (hueP     > 0.0) ? hueP     : 0.0;

    // Quantum circulation colors (deep ocean blue to electric cyan/emerald)
    vec3 blueCirc = vec3(0.05, 0.35, 1.0);
    vec3 greenCirc = vec3(0.10, 1.00, 0.75);
    vec3 vortexCol = mix(blueCirc, greenCirc, fract(vRingID * 0.2 + time * 0.3));

    // Circulation pulse wave
    float pulse = sin(vCirc * 10.0 - time * 8.0) * 0.5 + 0.5;
    vec3 coreGlow = mix(vortexCol, vec3(1.0), pulse * 0.7);

    // Photo reflection mapping
    vec2 photoUV = vPos.xy * 0.15 + 0.5;
    vec3 photoCol = img(fract(photoUV));

    vec3 col = (coreGlow * 2.2 + photoCol * 0.4) * (0.8 + 1.2 * audioKick) * vtx * glw;

    col = hueRot(col, audioChromaHue + hue);
    // Catalogue review: soft-knee exposure — hot audio compresses
    // instead of clipping the whole frame to white.
    vec3 _catTone = (col) * 0.5;
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
