#version 330 core
// TeslaLightningTree.vert
// attrA.xyz = world pos, attrA.w = heat
// attrB.w = boltSeed (GEOM_INDIRECT, 8-float layout)
in vec4 attrA;
in vec4 attrB;

uniform mat4 projM;
uniform float eyeOff;
uniform float time;
uniform float audioKick;

out vec3 vPos;
out float vHeat;
out float vBoltID;

void main() {
    vec3 worldP = attrA.xyz;
    vPos = worldP;
    vHeat = attrA.w;
    vBoltID = attrB.w;

    // Stereoscopic 3D camera projection
    vec3 vp = worldP;
    vp.z += 6.5;
    vp.x -= eyeOff;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
