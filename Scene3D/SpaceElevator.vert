#version 330 core
/**
 * @file SpaceElevator.vert
 * @brief SPACE ELEVATOR: A towering structure extending from a planet's surface
 * into orbit. Elevators travel along the massive tether, with structural rings
 * and orbital tethers surrounding it.
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

    // Elements:
    // 0.0 - 0.5: The main tether / spine structure
    // 0.5 - 0.8: Support rings / platforms
    // 0.8 - 1.0: Elevator cars climbing the tether
    
    vec3 scale;
    vec3 centre;
    mat3 rotMat = mat3(1.0);
    
    // The structure goes along the Y axis
    // Camera travels up the Y axis
    float camY = time * 15.0 + audioAdvance * 20.0;
    
    if (r4 < 0.5) {
        // Main tether struts
        float theta = r1 * 6.2831853;
        float radius = 5.0 + r2 * 2.0;
        float y = (r3 - 0.5) * 400.0; // Very tall
        
        centre = vec3(radius * cos(theta), y, radius * sin(theta));
        scale = vec3(1.0, 20.0, 1.0) * (1.0 + r2);
        
        // Face outward
        vec3 forward = normalize(vec3(cos(theta), 0.0, sin(theta)));
        vec3 up = vec3(0.0, 1.0, 0.0);
        vec3 right = cross(up, forward);
        rotMat = mat3(right, up, forward);
    } 
    else if (r4 < 0.8) {
        // Support rings
        float ringId = floor(r3 * 10.0); // 10 rings in local space
        float y = (ringId / 10.0 - 0.5) * 400.0;
        float theta = r1 * 6.2831853;
        float radius = 15.0 + r2 * 5.0;
        
        centre = vec3(radius * cos(theta), y, radius * sin(theta));
        scale = vec3(3.0, 1.0, 3.0) * (1.0 + r2);
        
        vec3 forward = vec3(0.0, 1.0, 0.0);
        vec3 up = normalize(vec3(-cos(theta), 0.0, -sin(theta)));
        vec3 right = cross(up, forward);
        rotMat = mat3(right, up, forward);
    }
    else {
        // Elevator cars climbing
        float theta = r1 * 6.2831853;
        float radius = 10.0;
        
        // Speed up the cars relative to the camera
        float carSpeed = 40.0;
        float climbT = time * carSpeed + audioAdvance * carSpeed;
        float y = (r3 - 0.5) * 400.0 + climbT;
        
        centre = vec3(radius * cos(theta), y, radius * sin(theta));
        scale = vec3(2.0, 6.0, 2.0) * (1.0 + r2);
        
        vec3 forward = normalize(vec3(cos(theta), 0.0, sin(theta)));
        vec3 up = vec3(0.0, 1.0, 0.0);
        vec3 right = cross(up, forward);
        rotMat = mat3(right, up, forward);
    }

    vec3 localPos = attrA.xyz * scale;
    vec3 world = centre + rotMat * localPos;
    
    // Wrap around Z (or Y in this case) relative to camera
    world.y = mod(world.y - camY + 200.0, 400.0) - 200.0;
    
    // Rotate the whole structure slowly
    float spin = time * 0.1 + audioAdvance * 0.2;
    mat2 rotY = mat2(cos(spin), -sin(spin), sin(spin), cos(spin));
    world.xz = rotY * world.xz;
    
    // Camera offset to the side, looking up the tether. The old pitch
    // rotation mixed world.y (wrapped into +-200, i.e. often huge) into z
    // AFTER the wrap, so most of the tether landed at wildly wrong depths
    // and got culled -- this is why the scene measured pure black. Tilting
    // the VIEW DIRECTION instead (a fixed forward.y bias proportional to
    // depth) achieves the same "looking up" framing without touching the
    // wrapped position.
    world.z -= 40.0;
    world.y += 10.0 - world.z * 0.55;

    if (world.z > 2.0 || world.z < -250.0)
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
    nWorld.xz = rotY * nWorld.xz;

    vCol = vec4(r1, r2, r3, r4); // r4 tells us what part it is
    vCorner = attrA.xyz;
    vPos = world;
    vNormal = nWorld;
}
