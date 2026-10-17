#version 330 core
/*****************************************************************************\
 *                              MeshRocketLaunch.vert
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Vertex stage companion to MeshRocketLaunch.frag -- see that file's header.
 *
 *  Two loaded meshes and the sky shell, picked by gl_VertexID:
 *
 *    [0, meshVertexCount)                 the launch pad (model=), still, on the ground
 *    [meshVertexCount, mesh2VertexCount)  the rocket (model2=), standing on the pad, then climbing
 *    [mesh2VertexCount, ...)              the sky shell
 *
 *  Both meshes arrive normalised to a unit box, so their relative size is set
 *  HERE from real proportions (a 65 m rocket beside a 75 m tower), not read
 *  from the files. The liftoff is staged on sceneProgress: the engines light
 *  just before the liftoff mark, then the climb accelerates for the rest of
 *  the scene -- so the launch happens once and is over before the scene is,
 *  whatever length the scheduler rolled for it. Nothing here moves on a fast
 *  envelope: the burn is light, the climb is the clock.
 *
 *  @author René Weller
 */

in vec4 attrA; ///< mesh: xyz = object-space position, w = U.  shell: xyz = world-space position on the shell.
in vec4 attrB; ///< mesh: xyz = object-space normal,   w = V.  shell: xyz = outward direction.

uniform mat4  projM;            ///< Projection matrix.
uniform float eyeOff;           ///< Stereo eye offset (0 in mono).
uniform float time;             ///< Seconds since this activation, plus a rolled start (see sceneTime).
uniform int   meshVertexCount;  ///< Vertices of the scene's mesh.
uniform int   mesh2VertexCount; ///< Vertices of the scene's second mesh.
uniform vec3  meshExtent;       ///< half-extents of the pad, object space
uniform vec3  meshCenter;       ///< Centre of the scene's mesh bounding box.
uniform vec3  meshExtent2;      ///< half-extents of the rocket
uniform vec3  meshCenter2;      ///< Centre of the second mesh's bounding box.
uniform float sceneProgress;    ///< Progress through this scene's solo time, 0..1.

uniform float sizeP;  ///< Size knob, 0..1.
uniform float platP;  ///< the pad's platform height as a fraction of the pad's full height
uniform float offP;   ///< rocket offset across the pad, as a fraction of the pad's half-width
uniform float depthP; ///< rocket offset into the pad, as a fraction of the pad's half-depth
uniform float liftP;  ///< 0..1: where in the scene the liftoff falls

out vec2  vUV;     ///< Texture coordinate 0..1 over the screen (from the vertex stage).
out vec3  vNormal; ///< Surface normal (from the vertex stage).
out vec3  vPos;    ///< Position (from the vertex stage).
out vec3  vLocal;  ///< object space, normalised to -1..1 per axis
out float vBg;     ///< Background flag (from the vertex stage).
out float vRocket; ///< Rocket (from the vertex stage).
out vec4  vFlame;  ///< xyz = the engines' world position, w = burn 0..1
out float vClimb;  ///< 0 on the pad, 1 at the top of the climb

const float Dist = 84.0;    ///< the pad's distance from the camera
const float Ground = -16.0; ///< ground height: the pad sits low so the sky above has room for the climb

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    bool is_pad = gl_VertexID < meshVertexCount;
    bool is_rocket = gl_VertexID >= meshVertexCount && gl_VertexID < mesh2VertexCount;
    bool is_bg = gl_VertexID >= mesh2VertexCount;

    float sz = ( sizeP > 0.01 ? sizeP : 1.0 );
    float pad_h = 40.0 * sz; // the pad's full height in world units
    float s_pad = pad_h / ( 2.0 * meshExtent.y );
    float plat = ( platP > 0.001 ? platP : 0.30 );

    // Liftoff staging on the scene's own arc. Early enough that a scene the
    // scheduler cuts short still gets its launch: at 0.42..0.54 the
    // catalogue probe's own section cut re-armed the scene before the climb
    // and showed the rocket back on the pad.
    float p0 = 0.34 + 0.12 * clamp( liftP, 0.0, 1.0 );
    float u = clamp( ( sceneProgress - p0 ) / max( 1.0 - p0, 0.05 ), 0.0, 1.0 );
    float burn = smoothstep( p0 - 0.07, p0, sceneProgress );
    float climb = 110.0 * u * u * ( 0.55 + 0.45 * u ); // accelerating, as a launch does
    float tilt = -0.09 * u * u;                        // the gravity turn, barely begun

    // The rocket's frame is needed by every branch: the pad and the shell
    // are lit by its engines.
    float rocket_h = pad_h * 0.87;
    float s_r = rocket_h / ( 2.0 * meshExtent2.y );
    float plat_y = Ground + pad_h * plat;
    vec3  rocket_base = vec3( offP * meshExtent.x * s_pad, plat_y, Dist + depthP * meshExtent.z * s_pad );
    vec3  base_pos = rocket_base + vec3( climb * 0.5 * tilt, climb, 0.0 );
    float ct = cos( tilt ), st = sin( tilt );
    mat3  tilt_m = mat3( ct, st, 0.0, -st, ct, 0.0, 0.0, 0.0, 1.0 );

    vFlame = vec4( base_pos, burn );
    vClimb = u;
    vRocket = is_rocket ? 1.0 : 0.0;

    vec3 world, n;
    if ( is_pad )
    {
        // The generator builds a model facing ITS camera, the mesh's +Z,
        // which points away from ours: a half turn shows the pad's front.
        const mat3 pad_yaw = mat3( -1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, -1.0 );
        vec3       c = pad_yaw * ( attrA.xyz - meshCenter );
        world = c * s_pad + vec3( 0.0, Ground + meshExtent.y * s_pad, Dist );
        n = normalize( pad_yaw * attrB.xyz );
        vUV = vec2( attrA.w, attrB.w );
        vLocal = c / meshExtent;
    }
    else if ( is_rocket )
    {
        vec3 c = attrA.xyz - meshCenter2;
        vec3 local = c * s_r;
        local.y += meshExtent2.y * s_r; // pivot at the base, on the platform
        world = tilt_m * local + base_pos;
        n = normalize( tilt_m * attrB.xyz );
        vUV = vec2( attrA.w, attrB.w );
        vLocal = c / meshExtent2;
    }
    else
    {
        world = attrA.xyz;
        n = attrB.xyz;
        vUV = vec2( 0.0 );
        vLocal = vec3( 0.0 );
    }

    vec3 vp = world;
    vp.x -= eyeOff;
    gl_Position = projM * vec4( vp.x, vp.y, -vp.z, 1.0 );
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
    // Shell depth pinned just inside the far plane (standard skybox fix).
    if ( is_bg )
        gl_Position.z = gl_Position.w * 0.999999;

    vNormal = n;
    vPos = world;
    vBg = is_bg ? 1.0 : 0.0;
}
