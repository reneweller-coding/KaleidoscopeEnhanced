#version 330 core
/**
 * @file KaleidoDome.vert
 * @brief Vertex stage companion to KaleidoDome.frag -- see that file's header for
 * this scene's description.
 */
// KaleidoDome.vert — INSIDE a planetarium dome fully covered with a living
// kaleidoscope rosette of the current image.  The dome section always faces
// the camera (no tearing); all rotation happens in texture space.
// attrA.x = azimuth 0..1, attrA.y = elevation 0..1.

in vec4 attrA;   ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an index).
in vec4 attrB;   ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

uniform mat4  projM;   ///< Projection matrix.
uniform float eyeOff;   ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).

uniform float audioBass;   ///< Bass band level, 0..1.
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).

out vec2  vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
out float vR;

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    // Dome section: +-75 deg azimuth, +-63 deg elevation ahead of the camera.
    float az = (attrA.x - 0.5) * 2.62;
    float el = (attrA.y - 0.5) * 2.20;

    float R = 40.0 * (1.0 + 0.04 * audioBass);
    vec3 vp = vec3(sin(az) * cos(el), sin(el), cos(az) * cos(el)) * R;

    // Gentle observer sway so the dome feels physical.
    vp.x += 1.5 * sin(time * 0.21);
    vp.y += 1.0 * sin(time * 0.17 + 1.0);

    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.05 * gl_Position.w;

    // Polar coordinates on the dome for the rosette (0 = view centre).
    vUV = vec2(az, el);
    vR  = length(vec2(az, el));
}
