#version 330 core
// MetaSculpt.vert — the vertices arrive straight from MetaSculpt.comp, so
// there is nothing to generate here: place the body and pass the shading data.

in vec4 attrA;      // xyz = object position, w = field strength at that point
in vec4 attrB;      // xyz = surface normal (from the field gradient)

out vec3  vObj;
out vec3  vNormal;
out vec3  vView;
out vec3  vWorld;
out float vStrength;

uniform mat4  projM;
uniform mat4  lightM;
uniform float shadowPass;
uniform float eyeOff;
uniform float audioAdvance;
uniform float audioLevel;

uniform float camDistP;

void main()
{
    vec3 p = attrA.xyz;
    vec3 n = attrB.xyz;

    // Slow tumble, so the silhouette keeps presenting new lobes.
    float ya = audioAdvance * 0.10;
    float pa = 0.28 * sin(audioAdvance * 0.06);
    mat3 yaw   = mat3(cos(ya), 0.0, -sin(ya), 0.0, 1.0, 0.0, sin(ya), 0.0, cos(ya));
    mat3 pitch = mat3(1.0, 0.0, 0.0, 0.0, cos(pa), sin(pa), 0.0, -sin(pa), cos(pa));
    mat3 rot = yaw * pitch;

    vec3 pw = rot * p;
    float dist = camDistP * (1.0 - 0.05 * audioLevel);
    vec3 vp = vec3(pw.x - eyeOff, pw.y, pw.z + dist);

    vObj      = p;
    vNormal   = rot * n;
    vView     = normalize(-vp);
    vWorld    = pw;
    vStrength = attrA.w;

    // The shadow contract on the indirect path.  The generator has already run
    // once this frame (the engine skips it on the second pass), so both passes
    // draw the same mesh — which is exactly what a shadow map must be able to
    // assume.
    if (shadowPass > 0.5)
    {
        gl_Position = lightM * vec4(pw, 1.0);
    }
    else
    {
        gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
        gl_Position.x += eyeOff * 0.045 * gl_Position.w;
    }
}
