#version 330 core
// SpectroWeave.vert — the bundle arrives finished; fly the camera down its axis.

in vec4 attrA;      // xyz = position, w = band energy here
in vec4 attrB;      // xyz = normal, w = band 0..1

out vec3  vWorld;
out vec3  vNormal;
out vec3  vView;
out float vEnergy;
out float vBand;
out float vDist;

uniform mat4  projM;
uniform float eyeOff;
uniform float audioAdvance;
uniform float audioLevel;

uniform float camHP;

void main()
{
    vec3 p = attrA.xyz;

    // The camera drifts off the bundle's axis and back, so the weave is seen
    // from inside and from beside it in turn.
    float ox = 1.9 * sin(audioAdvance * 0.045);
    float oy = 1.4 * cos(audioAdvance * 0.031);
    vec3 vp = vec3(p.x - ox - eyeOff, p.y - oy - camHP, p.z);

    vWorld  = p;
    vNormal = attrB.xyz;
    vView   = normalize(-vp);
    vEnergy = attrA.w;
    vBand   = attrB.w;
    vDist   = p.z;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
