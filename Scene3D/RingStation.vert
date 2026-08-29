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
uniform float spinP;       // per-instance spin-speed factor, default 1.0
uniform float spinAxisP;   // which OBJECT axis it spins about: 0=X, 1=Y, 2=Z

out vec2 vUV;
out vec3 vNormal;
out vec3 vPos;
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
        // Every model from this generator is normalized to ~1.0 on its longest
        // axis (measured directly across the whole batch) -- 32 scales that up
        // to a size that reads clearly at this scene's ~110-unit camera distance,
        // sizeP then nudges it per-instance (megastructures bigger, outposts smaller).
        float sz = (sizeP > 0.01 ? sizeP : 1.0);
        vec3 local = attrA.xyz * (32.0 * sz);

        // A ring reads as a RING only if its own spin is the dominant motion --
        // a fixed axis tilt keeps it from looking like a flat, static
        // painting face-on to the camera. This runs independently of the
        // camera's own sweep (rig* formulas) -- a spin-gravity wheel that
        // doesn't spin reads as broken, regardless of what the camera does.
        // The tilt is a CONSTANT, not time-varying: a rotationally symmetric
        // body (a wheel/ring/torus, exactly what this family is) only
        // rotates about its own symmetry axis in reality -- animating the
        // tilt as well would wobble that axis over time, which reads as the
        // station physically tumbling rather than spinning in place.
        // The spin axis is NOT fixed for this family: its members are
        // symmetric about X (WheelStationPell), Y (jump gate, double ring,
        // megastructure hub) and Z (habitat ring) respectively, so the axis
        // comes in per instance from the measured geometry.
        // spinP is taken LITERALLY: 0 means the hull does not turn. It used to
        // fall back to 1.0 when unset, which made "no rotation" impossible to
        // express here -- the other five station families already used
        // max(spinP, 0.0), so this file was the odd one out. No scene had hit
        // it yet, but the whole point of the parameter is to be able to hold a
        // hull still, and an unset uniform reads 0: the safe default has to be
        // STILL, because a megastructure that fails to spin looks fine and one
        // that tumbles does not.
        float sp = max(spinP, 0.0);
        const float tiltX = 0.55;
        mat3 spinMat = axisSpin(spinAxisP, (time * 0.10 + audioAdvance * 0.15) * sp);
        float ctx = cos(tiltX), stx = sin(tiltX);
        mat3 tiltMat = mat3(1.0, 0.0, 0.0,   0.0, ctx, stx,   0.0, -stx, ctx);
        mat3 rotMat = tiltMat * spinMat;

        world = rotMat * local;
        world.z += 110.0;
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
