#version 330 core
/**
 * @file DysonSphereCore.vert
 * @brief Vertex stage companion to DysonSphereCore.frag -- see that file's header
 * for this scene's description.
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

    // We build a massive shell structure out of the cubes
    // 4900 cubes arranged as giant panels on a sphere
    
    // Distribute evenly on a sphere segment
    float theta = r1 * 6.2831853; // around Y
    float phi = (r2 - 0.5) * 3.14159; // elevation
    
    // Radius of the Dyson sphere
    float radius = 150.0;
    
    // Slow rotation of the sphere
    float rotT = time * 0.05 + audioAdvance * 0.1;
    theta += rotT;
    
    vec3 dir = vec3(cos(phi) * cos(theta), sin(phi), cos(phi) * sin(theta));
    vec3 centre = dir * radius;
    
    // Scale cubes into huge flat panels or spires
    float isSpire = step(0.9, r4);
    vec3 scale = isSpire > 0.5 ? vec3(2.0, 2.0, 15.0) : vec3(12.0, 12.0, 0.5);
    
    // Add some random variation
    scale *= 1.0 + r3 * 0.5;
    
    // Orient the panel so its flat side faces the center
    // We need a rotation matrix that rotates (0,0,1) to dir
    vec3 up = vec3(0.0, 1.0, 0.0);
    if(abs(dir.y) > 0.99) up = vec3(1.0, 0.0, 0.0);
    vec3 right = normalize(cross(up, dir));
    vec3 realUp = cross(dir, right);
    
    mat3 rotMat = mat3(right, realUp, dir);
    
    vec3 localPos = attrA.xyz * scale;
    vec3 world = centre + rotMat * localPos;
    
    // Camera is inside the sphere, offset by drift
    float camZ = time * 2.0 + audioAdvance * 5.0;
    world.z -= camZ;
    
    // Loop the space so we never run out of panels (wrap them around)
    // Actually, it's a sphere, so we just let it rotate. We move the camera inside.
    // If the camera moves too far, wrap the world position.
    world.z = mod(world.z + radius, radius * 2.0) - radius;
    world.x = mod(world.x + radius, radius * 2.0) - radius;
    world.y = mod(world.y + radius, radius * 2.0) - radius;
    
    // Distance check for culling.
    //
    // The far bound was 140 while the shell this scene is made of has radius
    // 150 -- the cull was TIGHTER THAN THE STRUCTURE it exists to show.  Only
    // z is actually displaced (world.x/y are already inside [-150,150], so
    // their mod() is a no-op), so whenever camZ's wrap phase left the shell
    // near its natural radius, EVERY panel failed the test and the frame went
    // uniformly empty: measured 0.0 % survivors at phase 0, and 44 % of all
    // rendered frames came back with zero spatial variance.
    // 260 sits just past the largest distance the wrap can produce (212).
    float zDist = length(world);
    if (zDist < 2.0 || zDist > 260.0)
    {
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);
        vCol = vec4(0.0); vCorner = attrA.xyz;
        return;
    }

    vec3 vp = world;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.06 * gl_Position.w;

    // Normal based on cube face
    vec3 nLocal = vec3(0.0);
    if(abs(attrA.x) > 0.49) nLocal = vec3(sign(attrA.x), 0.0, 0.0);
    else if(abs(attrA.y) > 0.49) nLocal = vec3(0.0, sign(attrA.y), 0.0);
    else nLocal = vec3(0.0, 0.0, sign(attrA.z));
    vec3 nWorld = rotMat * nLocal;
    
    vCol = vec4(r1, r2, r3, r4);
    vCorner = attrA.xyz;
    vPos = world;
    vNormal = nWorld;
}
