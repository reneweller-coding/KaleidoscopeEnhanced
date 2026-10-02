#version 330 core
/**
 * @file MeshSeismograph.vert
 * @brief Vertex stage companion to MeshSeismograph.frag -- see that file's
 * header. Two models: the instrument's base with its pen arm (model=), held
 * still, and the recording drum (model2=), turning about its horizontal
 * axle on time at the rate the fragment stage assumes when it draws the
 * trace. The drum's place beside the pen is set by three fractions of the
 * base's extents (drumXP/YP/ZP), tuned once against the models.
 */

in vec4 attrA;   ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an index).
in vec4 attrB;   ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

uniform mat4  projM;   ///< Projection matrix.
uniform float eyeOff;   ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform int   meshVertexCount;   ///< Vertices of the scene's mesh.
uniform int   mesh2VertexCount;
uniform vec3  meshExtent;   ///< Half size of the scene's mesh bounding box.
uniform vec3  meshCenter;   ///< Centre of the scene's mesh bounding box.
uniform vec3  meshExtent2;
uniform vec3  meshCenter2;

uniform float sizeP;   ///< Size knob, 0..1.
uniform float drumP;      ///< drum size relative to the base (default 0.45)
uniform float drumXP;     ///< drum centre across the base, fraction of its half-width
uniform float drumYP;     ///< drum centre height, fraction of the base's full height
uniform float drumZP;     ///< drum centre depth, fraction of the base's half-depth

out vec2  vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
out vec3  vNormal;   ///< Surface normal (from the vertex stage).
out vec3  vPos;   ///< Position (from the vertex stage).
out vec3  vLocal;   ///< Object-space position (from the vertex stage).
out float vBg;   ///< Background flag (from the vertex stage).
out float vDrum;
out float vTurn;

const float kDist   = 46.0;
const float kGround = -16.0;
const float kRate   = 0.35;   ///< radians per second, shared with the fragment stage

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    bool isBase = gl_VertexID <  meshVertexCount;
    bool isDrum = gl_VertexID >= meshVertexCount && gl_VertexID < mesh2VertexCount;
    bool isBg   = gl_VertexID >= mesh2VertexCount;
    vec3 world, n;
    vDrum = isDrum ? 1.0 : 0.0;
    vTurn = time * kRate;

    float sz = 14.0 * (sizeP > 0.01 ? sizeP : 1.0);
    float mxB = max(meshExtent.x, max(meshExtent.y, meshExtent.z));
    vec3 baseHalf = meshExtent / mxB * sz;
    const mat3 turnM = mat3(-1.0, 0.0, 0.0,   0.0, 1.0, 0.0,   0.0, 0.0, -1.0);

    if (isBase)
    {
        vec3 c = attrA.xyz - meshCenter;
        world = turnM * (c / mxB * sz) + vec3(0.0, kGround + baseHalf.y, kDist);
        n = normalize(turnM * attrB.xyz);
        vUV = vec2(attrA.w, attrB.w);
        vLocal = c / meshExtent;
    }
    else if (isDrum)
    {
        float szD = sz * (drumP > 0.01 ? drumP : 0.45);
        vec3 c = attrA.xyz - meshCenter2;
        float mx = max(meshExtent2.x, max(meshExtent2.y, meshExtent2.z));
        vec3 local = c / mx * szD;
        // Turn about the axle (the model's longest axis, x), then lay the
        // axle along world Z so it runs under the pen arm, which the base
        // model carries along X.
        float ang = vTurn;
        float ca = cos(ang), sa = sin(ang);
        mat3 rotX = mat3(1.0, 0.0, 0.0,   0.0, ca, sa,   0.0, -sa, ca);
        // The axle stays along X: seen end-on (axle along Z) the drum is a
        // disc and the paper is hidden. The pen tip sits on the drum's top.
        mat3 M = rotX;
        vec3 centre = vec3(drumXP * baseHalf.x, kGround + drumYP * 2.0 * baseHalf.y, kDist - drumZP * baseHalf.z);
        world = M * local + centre;
        n = normalize(M * attrB.xyz);
        vUV = vec2(attrA.w, attrB.w);
        vLocal = c / meshExtent2;
    }
    else
    {
        world = attrA.xyz;
        n = attrB.xyz;
        vUV = vec2(0.0);
        vLocal = vec3(0.0);
    }

    vec3 vp = world;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
    if (isBg) gl_Position.z = gl_Position.w * 0.999999;

    vNormal = n;
    vPos = world;
    vBg = isBg ? 1.0 : 0.0;
}
