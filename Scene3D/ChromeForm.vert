#version 330 core
/**
 * @file ChromeForm.vert
 * @brief Vertex stage for ChromeForm.frag. geom="mesh".
 *
 * A mirror shows its surroundings, not itself, so the only thing this stage
 * has to get right is that the surface keeps TURNING: a static mirror is a
 * still picture of a room. The turn is slow and about one axis, because what
 * the eye follows here is the reflection sliding across the form, and a tumble
 * would scramble that into noise.
 */

in vec4 attrA;   ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an index).
in vec4 attrB;   ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

uniform mat4  projM;   ///< Projection matrix.
uniform float eyeOff;   ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform int   meshVertexCount;   ///< Vertices of the scene's mesh.
uniform vec3  meshExtent;   ///< Half size of the scene's mesh bounding box.
uniform vec3  meshCenter;   ///< Centre of the scene's mesh bounding box.

uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).

uniform float sizeP;   ///< Size knob, 0..1.
uniform float spinP;   ///< Spin knob, 0..1.

out vec2  vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
out vec3  vNormal;   ///< Surface normal (from the vertex stage).
out vec3  vPos;   ///< Position (from the vertex stage).
out float vBg;   ///< Background flag (from the vertex stage).

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vec3 world, n;
    bool isBg = gl_VertexID >= meshVertexCount;

    if( !isBg )
    {
        float sz = (sizeP > 0.01 ? sizeP : 1.0);
        vec3 p = attrA.xyz - meshCenter;
        // Bounding-SPHERE framing, not longest-axis framing. Normalising the
        // longest half-axis to 0.5 bounds nothing once the model turns: the
        // diagonal reaches 0.5*sqrt(3), 1.7x the assumed size, which is why a
        // torus or a bell was cropped mid-frame (reported). The extents'
        // LENGTH is the bounding-sphere radius -- rotation-proof -- and the
        // scene's 55-degree frustum shows a half-height of 0.52*z, so the
        // scale below keeps the whole object inside with margin at any angle.
        float fit = 32.0 / 80.0 / max(length(meshExtent), 1e-5);

        // Rotation on TIME alone. audioAdvance integrates a beat-driven rate,
        // so anything it turns visibly speeds up on every kick -- measured as
        // residual beat-periodic motion (autocorr 0.46 @ 1s) after every other
        // coupling was removed. The summed coefficient keeps the average pace.
        float rotY = time * 0.18 * spinP;
        float rotX = 0.22 + 0.05 * sin(time * 0.07);
        float cy = cos(rotY), sy = sin(rotY);
        float cx = cos(rotX), sx = sin(rotX);
        mat3 spin = mat3(cy, 0.0, -sy,  0.0, 1.0, 0.0,  sy, 0.0, cy);
        mat3 tilt = mat3(1.0, 0.0, 0.0,  0.0, cx, sx,  0.0, -sx, cx);
        mat3 rot = tilt * spin;

        // No swell pulse on the SIZE any more (reported as wobble); the
        // music shows in what the chrome REFLECTS, not in the shape.
        world = rot * (p * (80.0 * sz * fit));
        world.z += 72.0;
        n = normalize(rot * attrB.xyz);
        vUV = vec2(attrA.w, attrB.w);
        vBg = 0.0;
    }
    else
    {
        world = attrA.xyz;
        n = normalize(attrB.xyz);
        vUV = vec2(0.0);
        vBg = 1.0;
    }

    vNormal = n;
    vPos = world;

    vec3 vp = vec3(world.x - eyeOff, world.y, world.z);
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    if( isBg ) gl_Position.z = gl_Position.w * 0.999999;
}
