#version 330 core
/**
 * @file SilkPhoto.vert
 * @brief Vertex stage companion to SilkPhoto.frag -- see that file's header for
 * this scene's description.
 */
// SilkPhoto.vert — the current image on a huge silk banner rippling in an
// audio-driven wind.  The cloth hangs from its top edge; the music is the
// wind, kicks slap a radial ripple through the fabric.
// attrA.x = across the banner, attrA.y = down the banner.

in vec4 attrA;   ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an index).
in vec4 attrB;   ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

uniform mat4  projM;   ///< Projection matrix.
uniform float eyeOff;   ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).

uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioBass;   ///< Bass band level, 0..1.

out vec2  vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
out float vShade;

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float u = attrA.x, w = attrA.y;

    // Banner 44 x 28, hanging ahead of the camera.
    vec3 p = vec3((u - 0.5) * 44.0, (0.5 - w) * 28.0 + 2.0, 36.0);

    // Wind: two travelling waves; amplitude grows toward the free bottom
    // edge (top edge is fixed) and with the music's energy.
    float wind = 0.35 + 0.9 * audioLevel + 0.7 * audioSwell;
    float ph1  = u * 7.0  + time * 1.9;
    float ph2  = u * 11.0 - w * 5.0 + time * 2.7;
    float sway = sin(ph1) * 1.8 + sin(ph2) * 0.9;

    // Kick ripple expanding from the banner centre.
    float d      = length(vec2(u - 0.5, w - 0.5));
    float ripple = sin(d * 40.0 - time * 9.0) * exp(-d * 4.0) * audioKick * 1.4;

    float amp = (0.25 + 0.75 * w) * wind;
    p.z += (sway + ripple) * amp + sin(w * 6.0 + time * 1.1) * 0.6 * audioBass;

    vec3 vp = p;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.05 * gl_Position.w;

    vUV = vec2(u, w);

    // Cheap cloth shading from the wave slope (folds catch the light).
    float slope = cos(ph1) * 1.8 * 7.0 + cos(ph2) * 0.9 * 11.0;
    vShade = clamp(0.75 + slope * 0.035 * amp, 0.35, 1.45);
}
