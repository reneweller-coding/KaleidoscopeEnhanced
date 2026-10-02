#version 330 core
/**
 * @file KineticTesseractOrigami.vert
 * @brief Vertex stage companion to KineticTesseractOrigami.frag -- see that file's header for
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
out float vFoldAngle;

/// @brief Pseudo-random number 0..1 from a float.
float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 71.19;
    p *= p + p;
    return fract(p);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main() {
    float quadID = attrA.w;
    float seed = hash11(quadID);

    // 50x60 Miura-ori origami facet grid
    float gridX = mod(quadID, 50.0);
    float gridY = floor(quadID / 50.0);

    vec2 gridUV = (vec2(gridX, gridY) - vec2(25.0, 30.0)) / 25.0;

    // Folding angle gamma (0 = flat, pi/2 = fully folded compact)
    float t = time * 0.35 + audioAdvance * 0.2;
    float fold = (0.5 + 0.45 * sin(t * 0.7 + length(gridUV) * 2.0)) * (1.0 - 0.3 * audioKick);

    // Miura-ori fold equations:
    float a = 0.12; // Facet length
    float b = 0.12; // Facet width
    float alpha = 1.047; // 60 degrees

    float v = asin(sin(alpha) * sin(fold));
    float u = asin(cos(alpha) / max(cos(v), 0.001));

    float x = (gridX - 25.0) * a * cos(v);
    float y = (gridY - 30.0) * b * cos(u);
    float z = ((mod(gridX + gridY, 2.0) == 0.0) ? 1.0 : -1.0) * a * sin(fold) * (1.0 + audioBass * 0.5);

    vec3 facetCenter = vec3(x, y, z);

    // Local vertex of quad
    vec2 offset = attrA.xy - vec2(0.5);
    vec3 localPos = vec3(offset.x * a * 0.95, offset.y * b * 0.95, 0.0);
    vec3 pos = facetCenter + localPos;

    vPos = pos;
    vUV = attrA.xy;
    vFoldAngle = fold;

    // Stereoscopic 3D camera projection
    vec3 vp = pos;
    vp.z += 4.5;
    vp.x -= eyeOff;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
