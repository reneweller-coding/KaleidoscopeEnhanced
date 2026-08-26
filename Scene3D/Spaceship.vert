#version 330 core
/**
 * @file Spaceship.vert
 * @brief Vertex stage companion to Spaceship.frag -- see that file's header
 * for this scene's description. geom="mesh": attrA/attrB carry a REAL loaded
 * model's position/UV/normal (see Tools/SHADER_AUTHORING.md's `mesh` row),
 * not a procedural pattern. gl_VertexID picks the vertex's own branch: below
 * meshVertexCount it is the loaded model, at or above it the enclosing sky
 * shell Scene3DShader::buildGeometry() appends -- Spaceship.frag paints a
 * nebula onto it.
 */

in vec4 attrA;   // mesh: xyz = object-space position, w = U.  shell: xyz = world-space position on the shell.
in vec4 attrB;   // mesh: xyz = object-space normal,   w = V.  shell: xyz = outward direction (reused as "sky direction").

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform int   meshVertexCount;

uniform float audioAdvance;
uniform float audioKick;

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
        // The generator's "game" export is NORMALIZED to roughly a unit
        // bounding box (measured directly: ~1.0 on its longest axis),
        // regardless of the "size_meters" the ship was conceptually
        // designed at -- that number never gets baked into these vertex
        // coordinates. Scale up to a size that reads clearly against this
        // scene's ~90-unit camera distance.
        const float kModelScale = 35.0;
        vec3 local = attrA.xyz * kModelScale;

        // Slow tumble + yaw so a single static asset still reads as alive;
        // audio only adds a small kick-driven bob -- this is one hero
        // object, not a crowd, so a big audio-synced jump would just look
        // like the model glitching rather than the scene reacting to the
        // music.
        float rotY = time * 0.15 + audioAdvance * 0.3;
        float rotX = sin(time * 0.07) * 0.2;
        float cy = cos(rotY), sy = sin(rotY);
        float cx = cos(rotX), sx = sin(rotX);
        mat3 rotYMat = mat3(cy, 0.0, -sy,   0.0, 1.0, 0.0,   sy, 0.0, cy);
        mat3 rotXMat = mat3(1.0, 0.0, 0.0,   0.0, cx, sx,   0.0, -sx, cx);
        mat3 rotMat = rotYMat * rotXMat;

        world = rotMat * local;
        world.z += 90.0;                                 // push out in front of the camera
        world.y += 4.0 * sin(time * 0.2) + 2.0 * audioKick;
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
