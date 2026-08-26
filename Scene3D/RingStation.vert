#version 330 core
/**
 * @file RingStation.vert
 * @brief Vertex stage companion to RingStation.frag -- see that file's header.
 * Shared by every wheel/ring/torus-shaped station (geom="mesh"): a slow
 * spin around the station's own hub axis, spin-gravity style, while the
 * camera does the big cinematic move (see this scene's rig* formulas in
 * Configurations/Komplett.xml). gl_VertexID picks the vertex's own branch:
 * below meshVertexCount it is the loaded model, at or above it it is the
 * enclosing sky shell Scene3DShader::buildGeometry() appends (see that
 * function's own comment) -- RingStation.frag renders a planet + starfield
 * onto that shell.
 */

in vec4 attrA;   // mesh: xyz = object-space position, w = U.  shell: xyz = world-space position on the shell.
in vec4 attrB;   // mesh: xyz = object-space normal,   w = V.  shell: xyz = outward direction (reused as "sky direction").

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform int   meshVertexCount;

uniform float audioAdvance;
uniform float audioKick;

uniform float sizeP;   // per-instance relative scale, default 1.0
uniform float spinP;   // per-instance spin-speed factor, default 1.0

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
        // Every model from this generator is normalized to ~1.0 on its longest
        // axis (measured directly across the whole batch) -- 32 scales that up
        // to a size that reads clearly at this scene's ~110-unit camera distance,
        // sizeP then nudges it per-instance (megastructures bigger, outposts smaller).
        float sz = (sizeP > 0.01 ? sizeP : 1.0);
        vec3 local = attrA.xyz * (32.0 * sz);

        // A ring reads as a RING only if its own spin is the dominant motion --
        // a slight axis tilt keeps it from looking like a flat, static
        // painting face-on to the camera. This runs independently of the
        // camera's own sweep (rig* formulas) -- a spin-gravity wheel that
        // doesn't spin reads as broken, regardless of what the camera does.
        float sp = (spinP > 0.01 ? spinP : 1.0);
        float rotZ = (time * 0.10 + audioAdvance * 0.15) * sp;
        float tiltX = 0.55 + 0.06 * sin(time * 0.05);

        float cz = cos(rotZ), sz2 = sin(rotZ);
        mat3 spinMat = mat3(cz, sz2, 0.0,  -sz2, cz, 0.0,   0.0, 0.0, 1.0);
        float ctx = cos(tiltX), stx = sin(tiltX);
        mat3 tiltMat = mat3(1.0, 0.0, 0.0,   0.0, ctx, stx,   0.0, -stx, ctx);
        mat3 rotMat = tiltMat * spinMat;

        world = rotMat * local;
        world.z += 110.0;
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
