#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
// SineTunnel.frag — smooth colour bands flow along the tube; a gentle
// helix stripe winds around it.  Deep teal-violet palette, no strobes.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).

in vec2  vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
in float vDist;   ///< Distance (from the vertex stage).
in float vAng;

/**
 * @file SineTunnel.frag
 * @brief Shades the procedural warp tunnel of SineTunnel.vert with smooth
 * longitudinal colour bands flowing toward the camera and a slow double
 * helix stripe winding around the tube wall, in a deep teal-violet palette.
 *
 * audioAdvance drives the flow speed of the bands and helix; audioChromaHue
 * rotates between the two band hues via hueRot; audioSwell and audioKick
 * brighten the wall; distance fog fades the far tube. A soft-knee tone-map
 * (the catalogue-review fix noted inline) compresses loud-audio exposure
 * instead of clipping the frame to white.
 */

/// @brief Rotates a colour's hue by an angle (about the grey axis).
vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float flow = time * 0.35 + audioAdvance * 0.9;

    // Longitudinal colour bands drifting toward the viewer.
    float band = 0.5 + 0.5 * sin(vUV.y * 26.0 - flow * 3.0);
    // A slow double helix stripe around the wall.
    float helix = 0.5 + 0.5 * sin(vAng * 2.0 + vUV.y * 40.0 - flow * 2.0);

    vec3 a = hueRot(vec3(0.10, 0.55, 0.60), audioChromaHue);
    vec3 b = hueRot(vec3(0.45, 0.15, 0.70), audioChromaHue);
    vec3 col = mix(a, b, band);
    col += vec3(0.85, 0.75, 0.55) * pow(helix, 6.0) * 0.7;

    col *= (0.75 + 0.4 * audioSwell + 0.35 * audioKick)
         * exp(-vDist * 0.010);
    // Catalogue review: soft-knee exposure — hot audio compresses
    // instead of clipping the whole frame to white.
    vec3 _catTone = (col * 1.5) * 0.7;
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
