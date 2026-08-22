#version 330 core
/**
 * @file TachyonCommRelay.vert
 * @brief Vertex stage companion to TachyonCommRelay.frag
 */

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform float cubeBudget;

uniform float audioAdvance;
uniform float audioKick;
uniform float audioSwell;
uniform float audioLevel;

out vec4 vCol;
out vec3 vCorner;
out vec3 vPos;
out vec3 vNormal;

void main()
{
    if (cubeBudget < 0.75 && mod(attrA.w, 2.0) > 0.5)
    {
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);
        vCol = vec4(0.0); vCorner = attrA.xyz;
        return;
    }

    float r1 = attrB.x, r2 = attrB.y, r3 = attrB.z, r4 = attrB.w;

    // Relay is formed by several massive rings and a central spire
    float isSpire = step(0.8, r4);
    
    vec3 scale;
    vec3 centre;
    mat3 rotMat;
    
    float spin = time * 0.2 + audioAdvance * 0.5;
    
    if (isSpire > 0.5) {
        // Central spire, long along Z axis
        scale = vec3(2.0, 2.0, 10.0) * (1.0 + r1);
        float z = (r2 - 0.5) * 200.0;
        centre = vec3(0.0, 0.0, z);
        
        rotMat = mat3(
            cos(spin), -sin(spin), 0.0,
            sin(spin), cos(spin), 0.0,
            0.0, 0.0, 1.0
        );
    } else {
        // Rings rotating around the spire
        float ringId = floor(r3 * 4.0); // 4 distinct rings
        float radius = 30.0 + ringId * 15.0;
        float z = (r3 - 0.5) * 80.0;
        
        float theta = r1 * 6.2831853 + spin * (ringId * 0.5 + 1.0) * (mod(ringId, 2.0) > 0.5 ? 1.0 : -1.0);
        
        centre = vec3(radius * cos(theta), radius * sin(theta), z);
        scale = vec3(4.0, 1.0, 4.0) * (1.0 + r2 * 2.0);
        
        // Orient ring segments
        vec3 forward = vec3(0.0, 0.0, 1.0);
        vec3 up = normalize(vec3(-cos(theta), -sin(theta), 0.0)); // face center
        vec3 right = cross(up, forward);
        
        rotMat = mat3(right, up, forward);
    }

    vec3 localPos = attrA.xyz * scale;
    vec3 world = centre + rotMat * localPos;
    
    // Camera travels slowly along the Z axis inside the rings
    float camZ = time * 8.0 + audioAdvance * 15.0;
    
    // Wrap around for infinite relay
    world.z = mod(world.z - camZ + 100.0, 200.0) - 100.0;
    
    // Cull things behind camera or too far
    if (world.z > 2.0 || world.z < -180.0)
    {
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);
        vCol = vec4(0.0); vCorner = attrA.xyz;
        return;
    }

    vec3 vp = world;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.06 * gl_Position.w;

    vec3 nLocal = vec3(0.0);
    if(abs(attrA.x) > 0.49) nLocal = vec3(sign(attrA.x), 0.0, 0.0);
    else if(abs(attrA.y) > 0.49) nLocal = vec3(0.0, sign(attrA.y), 0.0);
    else nLocal = vec3(0.0, 0.0, sign(attrA.z));
    vec3 nWorld = rotMat * nLocal;

    vCol = vec4(r1, r2, r3, isSpire);
    vCorner = attrA.xyz;
    vPos = world;
    vNormal = nWorld;
}
