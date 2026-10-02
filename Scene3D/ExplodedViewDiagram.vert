#version 330 core
/**
 * @file ExplodedViewDiagram.vert
 * @brief EXPLODED VIEW DIAGRAM: a ship model as the exploded drawing of a
 * technical manual.  Over the scene arc the parts move apart along smooth
 * radial paths (a low-frequency field of the position, so neighbouring
 * vertices move together and nothing tears), hold apart in the middle, and
 * come back together toward the end -- all on sceneProgress, never on a
 * beat.  The model turns slowly on the scene clock.  No camera motion.
 */
in vec4 attrA;   ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an index).
in vec4 attrB;   ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

uniform mat4  projM;   ///< Projection matrix.
uniform float eyeOff;   ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform float sceneAdvance;   ///< The music's advance since this scene was activated (integrated, never jumps).
uniform float sceneTime;   ///< Seconds since this scene was activated.
uniform float sceneProgress;   ///< Progress through this scene's solo time, 0..1.
uniform int   meshVertexCount;   ///< Vertices of the scene's mesh.
uniform vec3  meshExtent;   ///< Half size of the scene's mesh bounding box.
uniform vec3  meshCenter;   ///< Centre of the scene's mesh bounding box.

uniform float sizeP;   ///< Size knob, 0..1.
uniform float spreadP;   ///< Spread knob, 0..1.

out vec2 vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
out vec3 vNormal;   ///< Surface normal (from the vertex stage).
out vec3 vObj;   ///< Object-space position (from the vertex stage).
out vec3 vPos;   ///< Position (from the vertex stage).
out float vBg;   ///< Background flag (from the vertex stage).
out float vSpread;

/// @brief Pseudo-random number 0..1 from a 3D point.
float hash31(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
/// @brief Smooth 3D value noise, 0..1.
float noise3(vec3 p)
{
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n000 = hash31(i), n100 = hash31(i + vec3(1, 0, 0)), n010 = hash31(i + vec3(0, 1, 0)), n110 = hash31(i + vec3(1, 1, 0));
    float n001 = hash31(i + vec3(0, 0, 1)), n101 = hash31(i + vec3(1, 0, 1)), n011 = hash31(i + vec3(0, 1, 1)), n111 = hash31(i + vec3(1, 1, 1));
    return mix(mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y), mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    bool isBg = gl_VertexID >= meshVertexCount;
    if (isBg)
    {
        vec3 w = attrA.xyz;
        vNormal = normalize(attrB.xyz);
        vPos = w; vObj = w; vUV = vec2(0.0); vBg = 1.0; vSpread = 0.0;
        vec3 vp = vec3(w.x - eyeOff, w.y, w.z);
        gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
        gl_Position.z = gl_Position.w * 0.999999;
        return;
    }
    vec3 p = attrA.xyz - meshCenter;
    vec3 n = attrB.xyz;
    float rad = max(length(meshExtent), 1e-4);
    p /= rad;
    vObj = p;
    // The explosion: a smooth pulse over the arc; each region of the model
    // (a low-frequency noise of position) moves out along its own direction.
    float prog = clamp(sceneProgress, 0.0, 1.0);
    float ex = smoothstep(0.08, 0.4, prog) * (1.0 - smoothstep(0.65, 0.95, prog));
    float spread = (0.22 + 0.33 * clamp(spreadP, 0.0, 1.0)) * ex;
    vec3 field = vec3(noise3(p * 2.5 + 1.0), noise3(p * 2.5 + 7.0), noise3(p * 2.5 + 13.0)) - 0.5;
    vec3 dir = normalize(p + field * 1.2 + vec3(0.0, 0.15, 0.0));
    float amt = spread * (0.6 + 0.8 * noise3(p * 1.7 + 3.0));
    p += dir * amt;
    vSpread = amt;
    float ry = sceneAdvance * 0.1 + sceneTime * 0.025 + 0.6;
    float rx = 0.35;
    mat3 RY = mat3(cos(ry), 0.0, -sin(ry), 0.0, 1.0, 0.0, sin(ry), 0.0, cos(ry));
    mat3 RX = mat3(1.0, 0.0, 0.0, 0.0, cos(rx), sin(rx), 0.0, -sin(rx), cos(rx));
    p = RX * RY * p;
    n = RX * RY * n;
    float size = 4.2 * (sizeP > 0.05 ? sizeP : 1.0);
    vec3 world = p * size + vec3(0.0, 0.0, 15.0);
    vUV = vec2(attrA.w, attrB.w);
    vNormal = normalize(n);
    vPos = world;
    vBg = 0.0;
    vec3 vp = vec3(world.x - eyeOff, world.y, world.z);
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
