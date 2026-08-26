#version 330 core
/**
 * @file ShipDocking.vert
 * @brief Vertex stage companion to ShipDocking.frag -- see that file's
 * header. The first scene to use TWO loaded meshes, so the buffer has three
 * runs and gl_VertexID picks between them:
 *   [0, meshVertexCount)             the station (model=),  held still
 *   [meshVertexCount, mesh2VertexCount) the ship (model2=), flying the approach
 *   [mesh2VertexCount, ...)          the sky shell
 *
 * The ship is scaled to a FRACTION of the station (shipScaleP, ~0.1), which
 * is the whole point: both meshes arrive normalised to a unit box by the
 * generator, so drawn at equal scale a shuttle and a kilometres-wide station
 * come out the same size and the shot says nothing. The size difference IS
 * the story here.
 *
 * The approach is staged on `sceneProgress` and eased out (1-(1-t)^3), so
 * the ship closes fast from a distance and settles gently into the dock in
 * the last moments -- and it does that across whatever screen time the
 * scheduler gave the scene, not a fixed wall-clock duration.
 */

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform int   meshVertexCount;
uniform int   mesh2VertexCount;
uniform float sceneProgress;

uniform float audioAdvance;
uniform float audioKick;

uniform float sizeP;        // station scale
uniform float shipScaleP;   // ship size AS A FRACTION of the station
uniform float spinP;        // station spin (0 for a non-rotating hull)

out vec2  vUV;
out vec3  vNormal;
out vec3  vPos;
out vec3  vLocalPos;
out float vBg;
out float vShip;      // 1 on the ship, 0 on the station -- the frag stage lights them differently
out float vApproach;  // 0 far out, 1 docked; drives thruster and floodlight intensity

void main()
{
    vec3 world, n;
    bool isStation = gl_VertexID <  meshVertexCount;
    bool isShip    = gl_VertexID >= meshVertexCount && gl_VertexID < mesh2VertexCount;
    bool isBg      = gl_VertexID >= mesh2VertexCount;

    float sz  = (sizeP > 0.01 ? sizeP : 1.0);
    float t   = sceneProgress;
    float ease = 1.0 - pow(1.0 - t, 3.0);      // fast approach, gentle arrival

    vApproach = ease;
    vShip = isShip ? 1.0 : 0.0;

    // STAGING NOTE. A truthful size ratio makes this shot unreadable: at a
    // realistic shuttle-to-station scale the ship covers a couple of pixels
    // and simply cannot be seen. The compromise here is the one live-action
    // effects work uses -- keep the station large and far so it LOOMS, and
    // bring the ship much closer to the camera so perspective gives it back
    // some screen size. The ship still reads as roughly a fifth of the
    // station on screen while being nowhere near that fraction in world
    // units, which is what sells the difference without hiding the subject.
    if( isStation )
    {
        vec3 local = attrA.xyz * (90.0 * sz);
        // A station may rotate about its own axis (spin gravity) but never
        // tumbles -- see the station families for the reasoning.
        float sp = (spinP > 0.001 ? spinP : 0.0);
        float rot = (time * 0.06 + audioAdvance * 0.05) * sp;
        float cr = cos(rot), sr = sin(rot);
        mat3 spinM = mat3(cr, sr, 0.0,  -sr, cr, 0.0,  0.0, 0.0, 1.0);
        const float tiltX = 0.35;
        float cx = cos(tiltX), sx = sin(tiltX);
        mat3 tiltM = mat3(1.0, 0.0, 0.0,  0.0, cx, sx,  0.0, -sx, cx);
        mat3 rotM = tiltM * spinM;

        world = rotM * local;
        world.x += 10.0;
        world.z += 150.0;
        n = normalize(rotM * attrB.xyz);
        vUV = vec2(attrA.w, attrB.w);
        vLocalPos = attrA.xyz;
    }
    else if( isShip )
    {
        float shs = (shipScaleP > 0.001 ? shipScaleP : 0.26);
        // Nose (+Z) onto the approach direction (+X), so it flies nose-first
        // toward the station rather than drifting sideways.
        vec3 p = attrA.xyz, nrm = attrB.xyz;
        p   = vec3(p.z, p.y, -p.x);
        nrm = vec3(nrm.z, nrm.y, -nrm.x);
        vec3 local = p * (90.0 * sz * shs);

        // Approach path: in from the lower left and further out, curving up
        // to the station's dock side. Kept as a straight-ish lerp with an
        // arc on Y so it reads as a controlled approach, not a fall.
        // Ends adjacent to the station's near rim (station centre x=10,
        // half-extent ~45 at the scale above), and much closer to the
        // camera along the way -- see the staging note further up.
        //
        // The START must stay inside kSceneFar (220) INCLUDING the ship's own
        // half-extent, or the far plane simply clips it away and the first
        // half of the approach plays with nothing on screen. An earlier
        // version started at z=300 and the ship was invisible until it had
        // already almost arrived.
        vec3 start = vec3(-150.0, -58.0, 196.0);
        // The dock sits on the station's NEAR face (the station spans roughly
        // z 106..194 at this scale), not its centre -- that keeps the ship
        // closer to the camera at the end of the run, where it needs the
        // screen size most.
        vec3 dock  = vec3( -38.0,  -6.0, 124.0);
        world = mix(start, dock, ease);
        world.y += 9.0 * sin(ease * 3.14159) * (1.0 - ease * 0.5);   // arc over

        // Yaw to face travel, flattening out as it arrives.
        float yaw = -0.5 * (1.0 - ease);
        float cy = cos(yaw), sy = sin(yaw);
        mat3 yawM = mat3(cy, 0.0, -sy,  0.0, 1.0, 0.0,  sy, 0.0, cy);
        world += yawM * local;
        n = normalize(yawM * nrm);
        vUV = vec2(attrA.w, attrB.w);
        vLocalPos = p;
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
    if (isBg) gl_Position.z = gl_Position.w * 0.999999;

    vNormal = n;
    vPos = world;
    vBg = isBg ? 1.0 : 0.0;
}
