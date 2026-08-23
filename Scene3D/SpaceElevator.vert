#version 330 core
/**
 * @file SpaceElevator.vert
 * @brief SPACE ELEVATOR: A towering structure extending from a planet's surface
 * into orbit. Elevators travel along the massive tether, with structural rings
 * and orbital tethers surrounding it.
 *
 * REBUILT V3. The placement/camera mathematics below is copied VERBATIM from
 * TachyonCommRelay.vert -- the geom=cubes travel-axis scene whose rendering is
 * proven (verified frames in the catalogue) -- with only the ROLES remapped:
 * the central spire becomes the tether, the rings stay support rings, and a
 * slice of the ring population becomes elevator cars hugging the tether with
 * their own, faster climb so they visibly overtake the camera. Two previous
 * from-scratch layouts for this scene each rendered (near-)nothing; copying
 * the one formula that demonstrably works ends that guessing game.
 * vCol.w carries the ROLE (0.2 tether / 0.6 ring / 0.9 car) for the frag.
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

// GEOM_CUBES draws 36 non-indexed vertices per cube, so instance index and
// corner are both fully recoverable from gl_VertexID alone. This scene's
// vertex ATTRIBUTES arrive broken (attrA corners included): five successive
// layouts -- whether built on attrB seeds or on in-shader hashes of attrA.w
// -- all collapsed the 4900 instances into one or two giant clumps, the same
// below-source-level fingerprint the RenderDoc follow-up task tracks for
// EndOfTheUniverse. Rebuilding the identity from gl_VertexID sidesteps the
// attribute path entirely.
const vec3 kCube[36] = vec3[36](
    vec3(-0.5,-0.5,-0.5), vec3( 0.5,-0.5,-0.5), vec3( 0.5, 0.5,-0.5),
    vec3(-0.5,-0.5,-0.5), vec3( 0.5, 0.5,-0.5), vec3(-0.5, 0.5,-0.5),
    vec3(-0.5,-0.5, 0.5), vec3( 0.5, 0.5, 0.5), vec3( 0.5,-0.5, 0.5),
    vec3(-0.5,-0.5, 0.5), vec3(-0.5, 0.5, 0.5), vec3( 0.5, 0.5, 0.5),
    vec3(-0.5,-0.5,-0.5), vec3(-0.5, 0.5,-0.5), vec3(-0.5, 0.5, 0.5),
    vec3(-0.5,-0.5,-0.5), vec3(-0.5, 0.5, 0.5), vec3(-0.5,-0.5, 0.5),
    vec3( 0.5,-0.5,-0.5), vec3( 0.5, 0.5, 0.5), vec3( 0.5, 0.5,-0.5),
    vec3( 0.5,-0.5,-0.5), vec3( 0.5,-0.5, 0.5), vec3( 0.5, 0.5, 0.5),
    vec3(-0.5,-0.5,-0.5), vec3(-0.5,-0.5, 0.5), vec3( 0.5,-0.5, 0.5),
    vec3(-0.5,-0.5,-0.5), vec3( 0.5,-0.5, 0.5), vec3( 0.5,-0.5,-0.5),
    vec3(-0.5, 0.5,-0.5), vec3( 0.5, 0.5, 0.5), vec3(-0.5, 0.5, 0.5),
    vec3(-0.5, 0.5,-0.5), vec3( 0.5, 0.5,-0.5), vec3( 0.5, 0.5, 0.5));

void main()
{
    float idx      = float(gl_VertexID / 36);
    vec3  cornerId = kCube[gl_VertexID - (gl_VertexID / 36) * 36];

    if (cubeBudget < 0.75 && mod(idx, 2.0) > 0.5)
    {
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);
        vCol = vec4(0.0); vCorner = cornerId;
        return;
    }

    float r1 = fract(sin(idx * 12.9898) * 43758.5453);
    float r2 = fract(sin(idx * 78.2330) * 43758.5453);
    float r3 = fract(sin(idx * 37.7190) * 43758.5453);
    float r4 = fract(sin(idx * 93.9890) * 43758.5453);

    vec3 scale;
    vec3 centre;
    mat3 rotMat;
    float roleW;

    float spin = time * 0.2 + audioAdvance * 0.5;

    // RADIUS BUDGET: commit 7a8212f's RenderDoc-driven finding for THIS scene
    // was that instances at radius 15-50 from the travel axis render nothing,
    // while radius 2-10 is reliable. Whatever the underlying cause (never
    // found at source level), the whole layout therefore lives inside that
    // proven 2-10 band: a tight elevator-shaft ride up the tether.
    if (r4 >= 0.8) {
        // TETHER: the central column, long along Z.
        scale = vec3(0.9, 0.9, 10.0) * (1.0 + r1 * 0.4);
        float z = (r2 - 0.5) * 200.0;
        centre = vec3(0.0, 0.0, z);

        rotMat = mat3(
            cos(spin), -sin(spin), 0.0,
            sin(spin), cos(spin), 0.0,
            0.0, 0.0, 1.0
        );
        roleW = 0.2;
    } else if (r4 >= 0.55) {
        // ELEVATOR CARS: pods hugging the tether at their own, faster climb
        // (time*14 vs the camera's time*8), so they overtake the view --
        // the motion cue that sells the ascent.
        float phi = floor(r1 * 4.0) / 4.0 * 6.2831853 + 0.7854;
        float z = (r2 - 0.5) * 200.0 + time * 14.0 + audioAdvance * 26.0;
        centre = vec3(2.6 * cos(phi), 2.6 * sin(phi), z);
        scale = vec3(0.9, 0.9, 2.6) * (0.9 + 0.4 * r3);

        rotMat = mat3(
            cos(spin), -sin(spin), 0.0,
            sin(spin), cos(spin), 0.0,
            0.0, 0.0, 1.0
        );
        roleW = 0.9;
    } else {
        // SUPPORT RINGS: tight collars around the shaft, inside the proven
        // radius band (5..9.2), sweeping past as the camera climbs.
        float ringId = floor(r3 * 4.0); // 4 distinct rings
        float radius = 5.0 + ringId * 1.4;
        float z = (r3 - 0.5) * 80.0;

        float theta = r1 * 6.2831853 + spin * (ringId * 0.5 + 1.0) * (mod(ringId, 2.0) > 0.5 ? 1.0 : -1.0);

        centre = vec3(radius * cos(theta), radius * sin(theta), z);
        scale = vec3(1.6, 0.5, 1.6) * (1.0 + r2);

        vec3 forward = vec3(0.0, 0.0, 1.0);
        vec3 up = normalize(vec3(-cos(theta), -sin(theta), 0.0)); // face center
        vec3 right = cross(up, forward);

        rotMat = mat3(right, up, forward);
        roleW = 0.6;
    }

    vec3 localPos = cornerId * scale;
    vec3 world = centre + rotMat * localPos;

    // Camera climbs slowly along the tether axis.
    float camZ = time * 8.0 + audioAdvance * 15.0;

    // Wrap around for an endless ascent. THE ROOT CAUSE of every black/clumped
    // rendering of this scene (and AsteroidMiningBase's magenta-test black):
    // the projection below hands projM `-vp.z`, so only world.z > 0 is IN
    // FRONT of the camera -- but the wrap/cull formula inherited from
    // TachyonCommRelay kept world.z in [-180, 2], i.e. everything except a
    // 2-unit-thin slice sat BEHIND the camera. Tachyon itself only ever shows
    // the lucky near-plane crossers of that slice. Wrap ahead instead:
    world.z = mod(world.z - camZ, 200.0);   // (0, 200] ahead of the lens

    // Step the camera OFF the axis so it rides beside the column instead of
    // inside it.
    world.x += 1.8;
    world.y -= 0.7;

    // Cull things at the lens or too far
    if (world.z < 1.5 || world.z > 170.0)
    {
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);
        vCol = vec4(0.0); vCorner = attrA.xyz;
        return;
    }

    vec3 vp = world;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.06 * gl_Position.w;

    // Face normal from which pair of table triangles this vertex belongs to
    int face = (gl_VertexID - (gl_VertexID / 36) * 36) / 6;
    vec3 nLocal = face == 0 ? vec3(0.0, 0.0, -1.0)
                : face == 1 ? vec3(0.0, 0.0, 1.0)
                : face == 2 ? vec3(-1.0, 0.0, 0.0)
                : face == 3 ? vec3(1.0, 0.0, 0.0)
                : face == 4 ? vec3(0.0, -1.0, 0.0)
                :             vec3(0.0, 1.0, 0.0);
    vec3 nWorld = rotMat * nLocal;

    vCol = vec4(r1, r2, r3, roleW); // roleW tells the frag what part it is
    vCorner = cornerId;
    vPos = world;
    vNormal = nWorld;
}
