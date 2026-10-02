#version 330 core
/**
 * @file MandalaGrid.vert
 * @brief Vertex stage companion to MandalaGrid.frag -- see that file's header for
 * this scene's description.
 */
// MandalaGrid.vert — a breathing mandala disc floating in space: the grid
// becomes a circular membrane whose surface carries slow radial standing
// waves; the fragment shader paints an 8-fold symmetric colour rosette.
// attrA.x = angle, attrA.y = radius.

in vec4 attrA;   ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an index).
in vec4 attrB;   ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

uniform mat4  projM;   ///< Projection matrix.
uniform float eyeOff;   ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).

uniform float audioBass;   ///< Bass band level, 0..1.
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).

out vec2  vPolar;                        ///< angle, radius 0..1
out float vLift;

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float u = attrA.x;                       // angle 0..1
    float w = attrA.y;                       // radius 0..1

    float ang = u * 6.2831853;
    float R   = w * 26.0;

    // Radial standing waves + a gentle m=6 angular mode; all slow.
    float ph = time * 0.5 + audioAdvance * 0.4;
    float h = sin(w * 14.0 - ph)            * (0.8 + 1.8 * audioBass)
            + sin(w * 6.0 + ph * 0.6)       * 0.7
            + sin(ang * 6.0 + ph * 0.35)    * 0.5 * w;
    h *= (0.6 + 0.6 * audioSwell) * (1.0 - w * 0.5);

    // Tilted toward the camera like an altar disc.
    float tilt = 0.55;
    vec2 p = vec2(cos(ang), sin(ang)) * R;
    vec3 vp = vec3(p.x,
                   (p.y + 4.0) * cos(tilt) + h - 4.0,
                   (p.y + 4.0) * sin(tilt) + 36.0 - h * 0.4);

    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.05 * gl_Position.w;

    vPolar = vec2(ang, w);
    vLift  = h;
}
