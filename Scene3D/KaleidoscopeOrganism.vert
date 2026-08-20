#version 330 core
/**
 * @file KaleidoscopeOrganism.vert
 * @brief Vertex stage companion to KaleidoscopeOrganism.frag -- see that file's header for
 * this scene's description.
 */
// KaleidoscopeOrganism.vert — the organism arrives already mirror-replicated
// by the compute generator (see KaleidoscopeOrganism.comp); this stage just
// turns the whole thing slowly so the kaleidoscope symmetry reads as real 3D
// volume rather than a flat rosette.

in vec4 attrA;      // xyz = object position, w = branch age (1 = oldest)
in vec4 attrB;      // xyz = normal, w = radial depth 0..1

out vec3  vObj;
out vec3  vNormal;
out vec3  vView;
out float vAge;
out float vDepth;

uniform mat4  projM;
uniform float eyeOff;
uniform float audioAdvance;
uniform float audioLevel;

uniform float camDistP;

void main()
{
    vec3 p = attrA.xyz;      // already framed + mirror-replicated by the generator

    float ya = audioAdvance * 0.06;
    mat3 yaw = mat3(cos(ya), 0.0, -sin(ya), 0.0, 1.0, 0.0, sin(ya), 0.0, cos(ya));

    vec3 pw = yaw * p;
    float dist = camDistP * (1.0 - 0.04 * audioLevel);
    vec3 vp = vec3(pw.x - eyeOff, pw.y, pw.z + dist);

    vObj    = p;
    vNormal = yaw * attrB.xyz;
    vView   = normalize(-vp);
    vAge    = attrA.w;
    vDepth  = attrB.w;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
