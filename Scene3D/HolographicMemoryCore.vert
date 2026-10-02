#version 330 core
/**
 * @file HolographicMemoryCore.vert
 * @brief Vertex stage companion to HolographicMemoryCore.frag -- see that file's header for
 * this scene's description.
 */
// attrA.xy = quad-local corner uv (0..1), attrA.w = quad id, attrB = seeds
// (Scene3DShader.cpp GEOM_QUADS)
in vec4 attrA;   ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an index).
in vec4 attrB;   ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

uniform mat4 projM;   ///< Projection matrix.
uniform float eyeOff;   ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform float audioPhase;   ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioBass;   ///< Bass band level, 0..1.
uniform float audioMid;   ///< Mid band level, 0..1.
uniform float audioHigh;   ///< High band level, 0..1.
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).

out vec3 vPos;   ///< Position (from the vertex stage).
out vec2 vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
out float vTier;
out float vReadLaser;

/// @brief Pseudo-random number 0..1 from a float.
float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 23.45;
    p *= p + p;
    return fract(p);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main() {
    float quadID = attrA.w;
    float seed = hash11(quadID);

    // Organize quads into 16 cylindrical storage tiers
    float tier = floor(quadID / 180.0);
    float tierAngle = mod(quadID, 180.0) / 180.0 * 6.2831853;

    float radius = 2.2 + 0.15 * sin(tier * 3.0 + time * 0.5);
    float height = (tier - 8.0) * 0.35 + sin(tierAngle * 4.0 + time) * 0.1;

    // Orbiting rotation
    float t = time * 0.2 + audioAdvance * 0.1;
    float currentAngle = tierAngle + t * (0.5 + 0.1 * tier);

    vec3 waferCenter = vec3(radius * cos(currentAngle), height, radius * sin(currentAngle));

    // Orientation: Face towards central laser emitter axis with slight tilt
    vec3 tangent = vec3(-sin(currentAngle), 0.0, cos(currentAngle));
    vec3 bitangent = vec3(0.0, 1.0, 0.0);

    // Quad local vertex offset
    vec2 offset = attrA.xy - vec2(0.5);
    float waferScale = 0.14 + 0.03 * sin(quadID * 0.1);

    vec3 localPos = offset.x * tangent * waferScale * 1.6 + offset.y * bitangent * waferScale;
    vec3 pos = waferCenter + localPos;

    // Read laser scanning beam on audio kicks & mid frequencies
    float laserHit = exp(-abs(height - sin(time * 3.0) * 2.0) * 4.0) * (0.8 + audioMid * 1.2);

    vPos = pos;
    vUV = attrA.xy;
    vTier = tier / 16.0;
    vReadLaser = laserHit;

    // Stereoscopic 3D camera projection
    vec3 vp = pos;
    vp.z += 4.8;
    vp.x -= eyeOff;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
