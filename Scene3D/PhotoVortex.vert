#version 330 core
/**
 * @file PhotoVortex.vert
 * @brief Vertex stage companion to PhotoVortex.frag -- see that file's header for
 * this scene's description.
 */
// PhotoVortex.vert — the current image spirals down a whirlpool funnel;
// kicks make the vortex gulp, the music's advance drives the swirl.
// attrA.x = angle around the funnel, attrA.y = radius (0 = throat).

in vec4 attrA;   ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an index).
in vec4 attrB;   ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

uniform mat4  projM;   ///< Projection matrix.
uniform float eyeOff;   ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).

uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioBass;   ///< Bass band level, 0..1.

out vec2  vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
out float vDepth;   ///< Depth (from the vertex stage).

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float u = attrA.x, w = attrA.y;

    float r = mix(1.6, 38.0, pow(w, 1.35));

    // Inner rings spin much faster (whirlpool shear).
    float swirl = (time * 0.35 + audioAdvance * 0.9) * pow(1.0 - w, 1.6) * 6.0;
    float ang   = u * 6.2831853 + swirl;

    // Funnel depth; the kick gulp briefly deepens the throat.
    float depth = -15.0 * pow(1.0 - w, 2.2)
                * (1.0 + 0.35 * audioKick + 0.15 * audioBass);

    vec3 world = vec3(cos(ang) * r, depth - 2.5, sin(ang) * r);

    // Fixed camera above the rim looking down into the funnel.
    vec3 p  = world - vec3(0.0, 9.0, -30.0);
    float pitch = -0.42;
    vec3 vp = vec3(p.x,
                   p.y * cos(pitch) - p.z * sin(pitch),
                   p.y * sin(pitch) + p.z * cos(pitch));

    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.05 * gl_Position.w;
    if (vp.z < 0.4)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);

    vUV   = vec2(u, w);
    vDepth = 1.0 - w;                       // 1 at the throat
}
