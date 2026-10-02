#version 330 core
/**
 * @file DysonSwarmSolarHarvester.vert
 * @brief Vertex stage companion to DysonSwarmSolarHarvester.frag -- see that file's header for
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
out float vRingIdx;
out float vLaserRelay;

/// @brief Pseudo-random number 0..1 from a float.
float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 83.45;
    p *= p + p;
    return fract(p);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main() {
    float quadID = attrA.w;
    float seed = hash11(quadID);

    // 16 concentric orbital inclination rings
    float ring = floor(quadID / 180.0);
    float satIdx = mod(quadID, 180.0);

    float orbitalRadius = 1.8 + ring * 0.18;
    float orbitalSpeed = 0.5 / sqrt(orbitalRadius);
    float inclination = (ring - 8.0) * 0.15;

    float t = time * 0.3 * orbitalSpeed + audioAdvance * 0.1;
    float trueAnomaly = (satIdx / 180.0) * 6.2831853 + t;

    // Orbital 3D coordinates
    vec3 orbPos = vec3(orbitalRadius * cos(trueAnomaly), sin(inclination) * orbitalRadius * sin(trueAnomaly), cos(inclination) * orbitalRadius * sin(trueAnomaly));

    // Satellite face pointing towards central star (0,0,0)
    vec3 toCenter = normalize(-orbPos);
    vec3 tangent = normalize(cross(toCenter, vec3(0.0, 1.0, 0.0)));
    vec3 bitangent = cross(toCenter, tangent);

    // Mirror quad local size
    vec2 offset = attrA.xy - vec2(0.5);
    float mirrorScale = 0.08 + 0.02 * sin(quadID * 0.2);

    vec3 pos = orbPos + (offset.x * tangent + offset.y * bitangent) * mirrorScale;

    // Laser relay pulses firing between swarm satellites on beat kicks
    float relay = (0.5 + 0.5 * sin(satIdx * 0.5 + time * 6.0)) * (1.0 + audioKick * 3.0);

    vPos = pos;
    vUV = attrA.xy;
    vRingIdx = ring / 16.0;
    vLaserRelay = relay;

    // Stereoscopic 3D camera projection
    vec3 vp = pos;
    vp.z += 5.5;
    vp.x -= eyeOff;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
