#version 330 core
/**
 * @file FortressStation.vert
 * @brief Vertex stage companion to FortressStation.frag -- see that file's
 * header. Shared by every armored/military station (geom="mesh"): these are
 * kilometers-long megastructures, not debris -- they hold a FIXED
 * orientation (a one-time angle, chosen only so the hull isn't seen flat-on)
 * and float stably; all the camera-facing motion comes from the camera's
 * own sweep (this scene's rig* formulas in Configurations/Komplett.xml) plus
 * a small audio-reactive rattle, not from the hull tumbling in place.
 * gl_VertexID picks the vertex's own branch: below meshVertexCount it is the
 * loaded model, at or above it the enclosing sky shell Scene3DShader::
 * buildGeometry() appends -- FortressStation.frag paints a nebula onto it.
 */

in vec4 attrA;   // mesh: xyz = object-space position, w = U.  shell: xyz = world-space position on the shell.
in vec4 attrB;   // mesh: xyz = object-space normal,   w = V.  shell: xyz = outward direction (reused as "sky direction").

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform int   meshVertexCount;

uniform float audioKick;

uniform float sizeP;

out vec2 vUV;
out vec3 vNormal;
out vec3 vPos;
out float vBg;

void main()
{
    vec3 world, n;
    bool isBg = gl_VertexID >= meshVertexCount;
    if( !isBg )
    {
        float sz = (sizeP > 0.01 ? sizeP : 1.0);
        vec3 local = attrA.xyz * (32.0 * sz);

        // A fixed viewing angle, not an animated tumble -- a real
        // kilometers-long fortress has far too much inertia to visibly
        // rotate, and drifting/tumbling in place would read as debris, not
        // a stationed defense platform. Kick adds a barely-there positional
        // jolt only, as if a distant impact just rattled the hull.
        const float rotY = 0.5, rotX = 0.12;
        float cy = cos(rotY), sy = sin(rotY);
        float cx = cos(rotX), sx = sin(rotX);
        mat3 rotYMat = mat3(cy, 0.0, -sy,   0.0, 1.0, 0.0,   sy, 0.0, cy);
        mat3 rotXMat = mat3(1.0, 0.0, 0.0,   0.0, cx, sx,   0.0, -sx, cx);
        mat3 rotMat = rotYMat * rotXMat;

        world = rotMat * local;
        world.z += 105.0;
        world.x += 0.6 * audioKick * sin(time * 37.0);   // rattle, not a bob
        n = normalize(rotMat * attrB.xyz);
        vUV = vec2(attrA.w, attrB.w);
    }
    else
    {
        world = attrA.xyz;
        n = attrB.xyz;
        vUV = vec2(0.0);
    }

    vec3 vp = world;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    vNormal = n;
    vPos = world;
    vBg = isBg ? 1.0 : 0.0;
}
