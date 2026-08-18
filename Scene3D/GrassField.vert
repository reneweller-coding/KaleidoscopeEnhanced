#version 330 core
/**
 * @file GrassField.vert
 * @brief Vertex stage companion to GrassField.frag -- see that file's header for
 * this scene's description.
 */
// GrassField.vert — one vertex per blade: place its root, nothing more.
// The blade itself is grown in the geometry shader.

in vec4 attrA;      // w = blade index
in vec4 attrB;      // four hashes

out vec3  gRoot;
out vec4  gRnd;
out float gIndex;

uniform float audioAdvance;
uniform float sceneSeed;
uniform float time;

// Field size.  z runs ahead of the camera (the engine projects with -z).
const float FIELD_W = 26.0;
const float FIELD_D = 55.0;

void main()
{
    float idx = attrA.w;
    vec4  h   = fract(attrB + sceneSeed * vec4(0.317, 0.113, 0.729, 0.451));

    // Blades are pushed toward the camera by squaring the depth hash.  With a
    // uniform spread the foreground — where each blade covers many pixels —
    // would look bald while the distance wastes thousands of sub-pixel blades.
    float z = 0.6 + FIELD_D * h.x * h.x;

    // Slow forward drift; wrapping in the field keeps the density constant.
    // The wrap has to happen BEFORE x is derived from z: a blade that wraps
    // from the far edge to the near one would otherwise keep the wide spread
    // it was given at the back, and the foreground stays bald.
    z = mod(z - time * 0.9 - audioAdvance * 0.35 - 0.6, FIELD_D) + 0.6;

    // Spread the blades in a cone that follows the view frustum, capped so the
    // far rows do not scatter into an empty plain.
    float halfW = min(0.95 * z + 1.0, FIELD_W);
    float x = (h.y - 0.5) * 2.0 * halfW;

    gRoot  = vec3(x, 0.0, z);
    gRnd   = h;
    gIndex = idx;
    gl_Position = vec4(gRoot, 1.0);
}
