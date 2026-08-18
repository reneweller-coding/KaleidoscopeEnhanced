#version 330 core
/**
 * @file SpectrumCity.vert
 * @brief Vertex stage companion to SpectrumCity.frag -- see that file's header for
 * this scene's description.
 */
// SpectrumCity.vert — place the city and rebuild each face's normal from the
// face index the generator packed in (box faces are axis-aligned, so an index
// is exact and leaves two floats free for the window pattern).

in vec4 attrA;      // xyz = world position, w = u along the facade
in vec4 attrB;      // x = face index, y = height above ground, z = lot hash, w = band energy

out vec3  vWorld;
out vec3  vNormal;
out float vFaceU;
out float vUp;
out float vLot;
out float vEnergy;
out float vDist;

uniform mat4  projM;
uniform float eyeOff;
uniform float audioAdvance;
uniform float audioLevel;

uniform float camHP;

void main()
{
    vec3 p = attrA.xyz;

    int f = int(attrB.x + 0.5);
    vec3 n = vec3(0.0, 1.0, 0.0);
    if      (f == 0) n = vec3( 1.0, 0.0,  0.0);
    else if (f == 1) n = vec3(-1.0, 0.0,  0.0);
    else if (f == 2) n = vec3( 0.0, 0.0,  1.0);
    else if (f == 3) n = vec3( 0.0, 0.0, -1.0);

    // A slow lateral drift down the avenue instead of a fixed viewpoint.
    float sway = 9.0 * sin(audioAdvance * 0.05);

    vec3 vp = vec3(p.x - sway - eyeOff,
                   p.y - camHP - 3.0 * audioLevel,
                   p.z);

    vWorld  = p;
    vNormal = n;
    vFaceU  = attrA.w;
    vUp     = attrB.y;
    vLot    = attrB.z;
    vEnergy = attrB.w;
    vDist   = p.z;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
