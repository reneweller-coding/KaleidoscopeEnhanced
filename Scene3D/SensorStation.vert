#version 330 core
/**
 * @file SensorStation.vert
 * @brief Vertex stage companion to SensorStation.frag -- see that file's
 * header. Shared by every science/sensor/comms station (geom="mesh"): these
 * are kilometers-long megastructures, not debris -- they hold a FIXED
 * orientation (a one-time angle, chosen only so the hull isn't seen
 * flat-on) and float stably; the "instrument at work" feel comes from the
 * scanning band in the fragment stage (it travels in OBJECT space, so it
 * needs no rotation to read as active), not from the whole structure
 * tumbling. The camera's own sweep (this scene's rig* formulas in
 * Presets/Komplett.xml) supplies the actual motion. gl_VertexID
 * picks the vertex's own branch: below meshVertexCount it is the loaded
 * model, at or above it the enclosing sky shell Scene3DShader::
 * buildGeometry() appends -- SensorStation.frag paints a nebula onto it.
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
uniform float spinAxisP;

out vec2 vUV;
out vec3 vNormal;
out vec3 vPos;
out vec3 vLocalPos;   // pre-scale object space, for the scan-sweep band in the frag stage (unused for the shell)
out float vBg;

// Rotation about one of the model's own object-space axes.
// spinAxisP: 0 = X, 1 = Y, 2 = Z -- set per instance to the axis the hull is
// actually rotationally symmetric about (measured per model, not guessed).
// A station only spins if it HAS such an axis: turning an irregular hull
// reads as tumbling, which a structure this size would never do, whereas a
// symmetric one that does NOT turn reads as broken spin gravity.
mat3 axisSpin(float axis, float ang)
{
    float c = cos(ang), s = sin(ang);
    if (axis < 0.5) return mat3(1.0, 0.0, 0.0,   0.0, c,   s,     0.0, -s,  c);
    if (axis < 1.5) return mat3(c,   0.0, -s,    0.0, 1.0, 0.0,   s,   0.0, c);
    return                 mat3(c,   s,   0.0,  -s,   c,   0.0,   0.0, 0.0, 1.0);
}

void main()
{
    vec3 world, n;
    bool isBg = gl_VertexID >= meshVertexCount;
    if( !isBg )
    {
        float sz = (sizeP > 0.01 ? sizeP : 1.0);
        vec3 local = attrA.xyz * (32.0 * sz);

        // A fixed VIEWING angle -- the hull never tumbles -- composed with a
        // spin about its own symmetry axis where it has one (see axisSpin()).
        const float rotY = 0.65, rotX = 0.2;
        float cy = cos(rotY), sy = sin(rotY);
        float cx = cos(rotX), sx = sin(rotX);
        mat3 rotYMat = mat3(cy, 0.0, -sy,   0.0, 1.0, 0.0,   sy, 0.0, cy);
        mat3 rotXMat = mat3(1.0, 0.0, 0.0,   0.0, cx, sx,   0.0, -sx, cx);
        mat3 rotMat = rotYMat * rotXMat * axisSpin(spinAxisP,
                      time * 0.105 * max(spinP, 0.0));   // time alone: advance jerks on kicks

        world = rotMat * local;
        world.z += 100.0;
        n = normalize(rotMat * attrB.xyz);
        vUV = vec2(attrA.w, attrB.w);
        vLocalPos = attrA.xyz;
    }
    else
    {
        world = attrA.xyz;
        n = attrB.xyz;
        vUV = vec2(0.0);
        vLocalPos = vec3(0.0);
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
