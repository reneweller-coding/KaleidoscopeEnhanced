#version 330 core
/**
 * @file SpectroDevice.vert
 * @brief Vertex stage companion to SpectroDevice.frag -- see that file's
 * header. A small prop on a showroom turntable, so unlike the station
 * families a steady single-axis spin is exactly right here (this is a
 * hi-fi unit on display, not a kilometers-long structure that would have
 * too much inertia to move).
 *
 * gl_VertexID picks the vertex's own branch: below meshVertexCount it is
 * the loaded model, at or above it the enclosing sky shell
 * Scene3DShader::buildGeometry() appends -- SpectroDevice.frag paints a
 * synthwave grid horizon onto that shell.
 */

in vec4 attrA;   // mesh: xyz = object-space position, w = U.  shell: xyz = world-space position on the shell.
in vec4 attrB;   // mesh: xyz = object-space normal,   w = V.  shell: xyz = outward direction (reused as "sky direction").

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform int   meshVertexCount;

uniform float audioAdvance;
uniform float audioKick;

uniform float sizeP;
uniform float spinP;

out vec2  vUV;
out vec3  vNormal;
out vec3  vPos;
out vec3  vLocalPos;    // object space, pre-scale -- the spectrum bars live in THIS space so they stay painted on the device instead of sliding across it as it turns
out vec3  vObjNormal;   // object space normal, for picking out the flat front panel
out float vBg;

void main()
{
    vec3 world, n;
    bool isBg = gl_VertexID >= meshVertexCount;
    if( !isBg )
    {
        float sz = (sizeP > 0.01 ? sizeP : 1.0);
        vec3 local = attrA.xyz * (30.0 * sz);

        // Showroom turntable: one clean axis, constant rate. The music
        // nudges the rate a little, but never enough to read as a jump.
        float sp = (spinP > 0.01 ? spinP : 1.0);
        float rotY = (time * 0.22 + audioAdvance * 0.10) * sp;
        const float tiltX = 0.16;                 // a hair from above, so it isn't seen edge-on
        float cy = cos(rotY), sy = sin(rotY);
        float cx = cos(tiltX), sx = sin(tiltX);
        mat3 rotYMat = mat3(cy, 0.0, -sy,   0.0, 1.0, 0.0,   sy, 0.0, cy);
        mat3 rotXMat = mat3(1.0, 0.0, 0.0,   0.0, cx, sx,   0.0, -sx, cx);
        mat3 rotMat = rotXMat * rotYMat;

        world = rotMat * local;
        world.z += 78.0;
        world.y += 0.8 * audioKick;
        n = normalize(rotMat * attrB.xyz);
        vUV = vec2(attrA.w, attrB.w);
        vLocalPos  = attrA.xyz;
        vObjNormal = attrB.xyz;
    }
    else
    {
        world = attrA.xyz;
        n = attrB.xyz;
        vUV = vec2(0.0);
        vLocalPos  = vec3(0.0);
        vObjNormal = vec3(0.0);
    }

    vec3 vp = world;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
    // The shell is a CUBE of half-side kSkyShellRadius, so its corners sit
    // sqrt(3) times further out than its faces -- past kSceneFar, which
    // clipped visible wedges out of the sky. Pinning shell depth just inside
    // the far plane is the standard skybox fix: no far-plane clipping however
    // big the shell is, and it can never occlude the object in front of it.
    if (isBg) gl_Position.z = gl_Position.w * 0.999999;

    vNormal = n;
    vPos = world;
    vBg = isBg ? 1.0 : 0.0;
}
