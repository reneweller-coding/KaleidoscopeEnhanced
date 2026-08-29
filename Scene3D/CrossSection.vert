#version 330 core
/**
 * @file CrossSection.vert
 * @brief Vertex stage companion to CrossSection.frag -- see that file's header
 * for the scene. geom="mesh": attrA/attrB carry a REAL loaded model (see
 * Tools/SHADER_AUTHORING.md's `mesh` row); gl_VertexID below meshVertexCount
 * is the model, at or above it the enclosing sky shell.
 *
 * The object holds one fixed attitude apart from a slow turn about a single
 * axis. All the motion in this scene belongs to the cutting plane, and a
 * tumbling subject would fight it: you cannot read where a plane is when the
 * thing it is cutting keeps changing which way it faces.
 */

in vec4 attrA;   // mesh: xyz = object-space position, w = U.  shell: xyz = world-space position on the shell.
in vec4 attrB;   // mesh: xyz = object-space normal,   w = V.  shell: xyz = outward direction (reused as "sky direction").

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform int   meshVertexCount;
uniform vec3  meshExtent;   // half-extents of THIS model, object space
uniform vec3  meshCenter;

uniform float audioAdvance;

uniform float sizeP;     // per-instance scale
uniform float spinP;     // turn rate about the vertical

out vec2  vUV;
out vec3  vNormal;
out vec3  vPos;
out vec3  vLocalPos;     // object space, BEFORE the turn: the plane cuts the
                         // object, not the world, so a turning object shows
                         // the same cut from changing angles rather than
                         // sweeping the cut across itself.
out float vBg;

void main()
{
    vec3 world, n;
    bool isBg = gl_VertexID >= meshVertexCount;

    if( !isBg )
    {
        float sz = (sizeP > 0.01 ? sizeP : 1.0);
        vec3 p = attrA.xyz;
        vLocalPos = p;

        float rotY = time * 0.09 * spinP + audioAdvance * 0.04 * spinP;
        float cy = cos(rotY), sy = sin(rotY);
        mat3 spin = mat3(cy, 0.0, -sy,  0.0, 1.0, 0.0,  sy, 0.0, cy);
        const float tiltX = 0.16;
        float cx = cos(tiltX), sx = sin(tiltX);
        mat3 tilt = mat3(1.0, 0.0, 0.0,  0.0, cx, sx,  0.0, -sx, cx);
        mat3 rot = tilt * spin;

        // Bounding-SPHERE framing, not longest-axis framing. Normalising the
        // longest half-axis to 0.5 bounds nothing once the model turns: the
        // diagonal reaches 0.5*sqrt(3), 1.7x the assumed size, which is why a
        // torus or a bell was cropped mid-frame (reported). The extents'
        // LENGTH is the bounding-sphere radius -- rotation-proof -- and the
        // scene's 55-degree frustum shows a half-height of 0.52*z, so the
        // scale below keeps the whole object inside with margin at any angle.
        float fit = 32.0 / 78.0 / max(length(meshExtent), 1e-5);
        world = rot * ((p - meshCenter) * (78.0 * sz * fit));
        world.z += 74.0;
        n = normalize(rot * attrB.xyz);
        vUV = vec2(attrA.w, attrB.w);
        vBg = 0.0;
    }
    else
    {
        world = attrA.xyz;
        n = normalize(attrB.xyz);
        vUV = vec2(0.0);
        vLocalPos = vec3(0.0);
        vBg = 1.0;
    }

    vNormal = n;
    vPos = world;

    vec3 vp = vec3(world.x - eyeOff, world.y, world.z);
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);

    // The shell is a CUBE, so its corners sit sqrt(3) further out than its
    // faces and the far plane clips wedges out of the sky. Pin its depth just
    // inside the far plane -- the standard skybox fix, mandatory for every
    // mesh scene (see SHADER_AUTHORING.md).
    if( isBg ) gl_Position.z = gl_Position.w * 0.999999;
}
