#version 330 core
// CathedralGlass.vert — place the window, and drop whichever half of the
// geometry does not belong to the pass currently running.

in vec4 attrA;      // xyz = object position, w = kind (0 stone, 1 glass)
in vec4 attrB;      // xyz = normal, w = band level for this pane

out vec3  vObj;
out vec3  vNormal;
out vec3  vView;
out float vKind;
out float vLevel;

uniform mat4  projM;
uniform float oitPass;
uniform float eyeOff;
uniform float audioAdvance;
uniform float audioLevel;
uniform float audioSubBass;

uniform float camDistP;

void main()
{
    float kind = attrA.w;

    // A pass draws only its own half.  Collapsing the rest behind the near plane
    // is cheaper than a discard: the fragments are never generated at all.
    bool wantGlass = (oitPass > 0.5);
    if ((kind > 0.5) != wantGlass)
    {
        gl_Position = vec4(0.0, 0.0, -2.0, 1.0);
        vObj = vec3(0.0); vNormal = vec3(0.0, 0.0, 1.0);
        vView = vec3(0.0, 0.0, 1.0); vKind = kind; vLevel = 0.0;
        return;
    }

    vec3 p = attrA.xyz;

    // A slow breathing sway, so the window is not a flat decal.  It leans, it
    // does not spin: a rose window that tumbles stops reading as architecture.
    float ya = 0.20 * sin(audioAdvance * 0.031);
    float pa = 0.13 * sin(audioAdvance * 0.024 + 1.1);
    mat3 yaw   = mat3(cos(ya), 0.0, -sin(ya), 0.0, 1.0, 0.0, sin(ya), 0.0, cos(ya));
    mat3 pitch = mat3(1.0, 0.0, 0.0, 0.0, cos(pa), sin(pa), 0.0, -sin(pa), cos(pa));
    mat3 rot = yaw * pitch;

    vec3 pw = rot * p;
    float dist = camDistP * (1.0 - 0.05 * audioSubBass);
    vec3 vp = vec3(pw.x - eyeOff, pw.y, pw.z + dist);

    vObj    = p;
    vNormal = rot * attrB.xyz;
    vView   = normalize(-vp);
    vKind   = kind;
    vLevel  = attrB.w;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
