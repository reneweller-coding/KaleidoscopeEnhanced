#version 330 core
// SmokeHall.vert — place the hall, and hand each pass only the geometry that
// belongs to it.  Three passes, two kinds:
//   shadow      hall  (smoke must not cast, or it would shadow its own shafts)
//   opaque      hall
//   transparent smoke

in vec4 attrA;      // xyz = object position, w = kind (0 hall, 1 smoke)
in vec4 attrB;      // xyz = normal, w = material id / slab depth

out vec3  vObj;
out vec3  vNormal;
out vec3  vView;
out vec3  vWorld;
out float vKind;
out float vExtra;

uniform mat4  projM;
uniform mat4  lightM;
uniform float shadowPass;
uniform float oitPass;
uniform float eyeOff;
uniform float audioLevel;

uniform float camHP;

void main()
{
    float kind = attrA.w;
    bool isSmoke = (kind > 0.5);
    bool wantSmoke = (oitPass > 0.5) && (shadowPass < 0.5);

    if (isSmoke != wantSmoke)
    {
        gl_Position = vec4(0.0, 0.0, -2.0, 1.0);
        vObj = vec3(0.0); vNormal = vec3(0.0, 1.0, 0.0);
        vView = vec3(0.0, 0.0, 1.0); vWorld = vec3(0.0);
        vKind = kind; vExtra = 0.0;
        return;
    }

    vec3 p = attrA.xyz;

    // No rotation anywhere in this scene, on purpose: the smoke slabs are
    // perpendicular to the view axis and stop working the moment the scene
    // turns under them.  The motion is the hall scrolling past instead.
    // The eye sits BEHIND the first row of pillars.  Put it level with them and
    // the nearest column stands a couple of units off the lens, subtending most
    // of the frame — the hall stops reading as a hall and becomes a black shape.
    vec3 vp = vec3(p.x - eyeOff, p.y - camHP, p.z + 6.0);

    vObj    = p;
    vNormal = attrB.xyz;
    vView   = normalize(-vp);
    vWorld  = p;
    vKind   = kind;
    vExtra  = attrB.w;

    if (shadowPass > 0.5)
    {
        gl_Position = lightM * vec4(p, 1.0);
    }
    else
    {
        gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
        gl_Position.x += eyeOff * 0.045 * gl_Position.w;
    }
}
