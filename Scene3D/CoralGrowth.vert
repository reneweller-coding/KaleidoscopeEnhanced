#version 330 core
/**
 * @file CoralGrowth.vert
 * @brief Vertex stage companion to CoralGrowth.frag -- see that file's header for
 * this scene's description.
 */
// CoralGrowth.vert — the colony arrives finished; turn it slowly so its
// branching structure is read as volume rather than as a flat thicket.

in vec4 attrA;      // xyz = object position, w = branch age (1 = oldest)
in vec4 attrB;      // xyz = normal, w = height 0..1

out vec3  vObj;
out vec3  vNormal;
out vec3  vView;
out float vAge;
out float vHeight;

uniform mat4  projM;
uniform float eyeOff;
uniform float audioAdvance;
uniform float audioLevel;

uniform float camDistP;

void main()
{
    vec3 p = attrA.xyz;      // already framed by the generator

    float ya = audioAdvance * 0.08;
    float pa = 0.20 * sin(audioAdvance * 0.05);
    mat3 yaw   = mat3(cos(ya), 0.0, -sin(ya), 0.0, 1.0, 0.0, sin(ya), 0.0, cos(ya));
    mat3 pitch = mat3(1.0, 0.0, 0.0, 0.0, cos(pa), sin(pa), 0.0, -sin(pa), cos(pa));
    mat3 rot = yaw * pitch;

    vec3 pw = rot * p;
    float dist = camDistP * (1.0 - 0.04 * audioLevel);
    vec3 vp = vec3(pw.x - eyeOff, pw.y, pw.z + dist);

    vObj    = p;
    vNormal = rot * attrB.xyz;
    vView   = normalize(-vp);
    vAge    = attrA.w;
    vHeight = attrB.w;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
