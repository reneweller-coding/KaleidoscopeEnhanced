#version 330 core
/**
 * @file HubStation.vert
 * @brief Vertex stage companion to HubStation.frag -- see that file's
 * header. Shared by every civilian/trade/cargo station (geom="mesh"): these
 * are kilometers-long megastructures, not debris -- they hold a FIXED
 * orientation (a one-time angle, chosen only so the hull isn't seen
 * flat-on) and float stably; the "busy hub" feel comes from the docking-
 * light twinkle in the fragment stage, not from the whole structure
 * bobbing or tumbling. The camera's own sweep (this scene's rig* formulas
 * in Configurations/Komplett.xml) supplies the actual motion. gl_VertexID
 * picks the vertex's own branch: below meshVertexCount it is the loaded
 * model, at or above it the enclosing sky shell Scene3DShader::
 * buildGeometry() appends -- HubStation.frag paints a starfield onto it.
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

        // A fixed viewing angle, not an animated tumble -- see this file's
        // header note on why a real megastructure holds still.
        const float rotY = 0.8, rotX = 0.1;
        float cy = cos(rotY), sy = sin(rotY);
        float cx = cos(rotX), sx = sin(rotX);
        mat3 rotYMat = mat3(cy, 0.0, -sy,   0.0, 1.0, 0.0,   sy, 0.0, cy);
        mat3 rotXMat = mat3(1.0, 0.0, 0.0,   0.0, cx, sx,   0.0, -sx, cx);
        mat3 rotMat = rotYMat * rotXMat;

        world = rotMat * local;
        world.z += 105.0;
        world.y += 1.5 * audioKick;
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
