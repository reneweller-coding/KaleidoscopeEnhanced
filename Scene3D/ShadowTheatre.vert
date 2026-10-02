#version 330 core
/**
 * @file ShadowTheatre.vert
 * @brief Vertex stage for ShadowTheatre.frag: a shadow play. The model stands
 * between a lamp and a lit screen, and what the audience sees is its outline.
 *
 * An earlier version of this family used the engine's real shadow map
 * (shadowPass/lightM/texShadow, the way Origami does). It rendered black: the
 * shadow pass is driven by a GLOBAL, EffectShader::s_shadowPass, and a
 * geom="mesh" scene reads it without the engine ever running the light pass for
 * it -- so the vertex stage kept taking the light-space branch and nothing ever
 * reached the camera. Proven by forcing that branch off, which brought the whole
 * frame back at once. A shadow PLAY needs no depth map: the screen is lit
 * directly, the caster is drawn as a silhouette in front of it, and the
 * softness comes from how close the caster is to the lamp -- which is exactly
 * what governs a real penumbra.
 *
 * The caster turns on two axes, because a shadow only changes when the profile
 * facing the lamp changes.
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
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).

uniform float sizeP;   ///< Size knob, 0..1.
uniform float spinP;   ///< Spin knob, 0..1.
uniform float nearP;    ///< how close to the lamp: bigger = larger, softer shadow

out vec3  vNormal;   ///< Surface normal (from the vertex stage).
out vec3  vPos;   ///< Position (from the vertex stage).
out vec3  vWorld;   ///< World position (from the vertex stage).
out float vBg;   ///< Background flag (from the vertex stage).

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vec3 world, n;
    bool isBg = gl_VertexID >= meshVertexCount;

    if( !isBg )
    {
        float sz = (sizeP > 0.01 ? sizeP : 1.0);
        float nr = (nearP > 0.01 ? nearP : 1.0);
        vec3 p = attrA.xyz - meshCenter;
        float fit = 0.5 / max(max(meshExtent.x, meshExtent.y), meshExtent.z);

        // Rotation on TIME alone. audioAdvance integrates a beat-driven rate,
        // so anything it turns visibly speeds up on every kick -- measured as
        // residual beat-periodic motion (autocorr 0.46 @ 1s) after every other
        // coupling was removed. The summed coefficient keeps the average pace.
        float ry = time * 0.27 * spinP;
        float rx = 0.46 * sin(time * 0.11 * spinP) + 0.20;
        float cy = cos(ry), sy = sin(ry), cx = cos(rx), sx = sin(rx);
        mat3 spin = mat3(cy, 0.0, -sy,  0.0, 1.0, 0.0,  sy, 0.0, cy);
        mat3 tilt = mat3(1.0, 0.0, 0.0,  0.0, cx, sx,  0.0, -sx, cx);
        mat3 rot = tilt * spin;

        // Closer to the lamp means a bigger, softer shadow -- the relationship a
        // hand held near a candle has. nearP scales the caster and the fragment
        // stage widens the penumbra to match, so the two stay consistent.
        world = rot * (p * (58.0 * sz * fit * nr));
        // Height only; the +2.5*audioKick hop made the puppet jump off its
        // stand on every beat (reported pattern). The beat belongs to the
        // LAMP -- the frag already pulses the backlight with the music.
        world.y += -6.0;
        world.z += 96.0;
        n = normalize(rot * attrB.xyz);
        vBg = 0.0;
    }
    else
    {
        world = attrA.xyz;
        n = normalize(attrB.xyz);
        vBg = 1.0;
    }

    vNormal = n;
    vPos = world;
    vWorld = world;

    vec3 vp = vec3(world.x - eyeOff, world.y, world.z);
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    if( isBg ) gl_Position.z = gl_Position.w * 0.999999;
}
