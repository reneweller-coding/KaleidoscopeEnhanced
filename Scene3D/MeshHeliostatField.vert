#version 330 core
/**
 * @file MeshHeliostatField.vert
 * @brief Vertex stage companion to MeshHeliostatField.frag -- see that
 * file's header. Two models and the shell, drawn instances="N" times:
 *   [0, meshVertexCount)                 the receiver tower (model=), instance 0 only
 *   [meshVertexCount, mesh2VertexCount)  one heliostat (model2=), placed by gl_InstanceID
 *   [mesh2VertexCount, ...)              the sky shell, instance 0 only
 * The other instances collapse the tower and the shell to a point.
 *
 * Every heliostat is aimed the way a real one is: its mirror normal
 * bisects the direction to the sun and the direction to the receiver, so
 * the field is a ring pattern of tilted panels. The sun creeps across the
 * sky on time, and the panels track it. The mirror model's panel faces
 * its own +Z (the generator's camera side); the rotation below takes +Z
 * to the aiming normal. The pedestal tilts with the panel, which is wrong
 * by a few degrees and invisible at this size.
 */

in vec4 attrA; ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an
               ///< index).
in vec4 attrB; ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

uniform mat4  projM;            ///< Projection matrix.
uniform float eyeOff;           ///< Stereo eye offset (0 in mono).
uniform float time;             ///< Seconds since the program started (never reset; see sceneTime).
uniform int   meshVertexCount;  ///< Vertices of the scene's mesh.
uniform int   mesh2VertexCount; ///< Vertices of the scene's second mesh.
uniform int   meshInstances;    ///< Number of mesh instances.
uniform vec3  meshExtent;       ///< Half size of the scene's mesh bounding box.
uniform vec3  meshCenter;       ///< Centre of the scene's mesh bounding box.
uniform vec3  meshExtent2;      ///< Half size of the second mesh's bounding box.
uniform vec3  meshCenter2;      ///< Centre of the second mesh's bounding box.

uniform float sizeP;   ///< Size knob, 0..1.
uniform float mirrorP; ///< heliostat size relative to the tower (default 1)

out vec2  vUV;     ///< Texture coordinate 0..1 over the screen (from the vertex stage).
out vec3  vNormal; ///< Surface normal (from the vertex stage).
out vec3  vPos;    ///< Position (from the vertex stage).
out vec3  vLocal;  ///< Object-space position (from the vertex stage).
out float vBg;     ///< Background flag (from the vertex stage).
out float vMirror; ///< Mirror (from the vertex stage).
out vec3  vAim;    ///< the heliostat's aiming normal (world): its glass is the face that points this way

const float Ground = -6.0;                          ///< Height of the ground (world units).
const vec3  TowerFoot = vec3( 0.0, Ground, 170.0 ); ///< Foot of the receiver tower.
const float TowerH = 70.0;                          ///< Height of the towers (world units).

/**  Direction to the sun, drifting slowly.
 *
 * @return
 *   The unit direction.
 **/
vec3 sunDir()
{
    float a = 0.4 + 0.10 * sin( time * 0.017 );
    float e = 0.62 + 0.06 * sin( time * 0.011 );
    return normalize( vec3( sin( a ) * cos( e ), sin( e ), -cos( a ) * cos( e ) ) );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    int  inst = gl_InstanceID;
    int  N = max( meshInstances, 1 );
    bool is_tower = gl_VertexID < meshVertexCount;
    bool is_mirror = gl_VertexID >= meshVertexCount && gl_VertexID < mesh2VertexCount;
    bool is_bg = gl_VertexID >= mesh2VertexCount;

    float sz = ( sizeP > 0.01 ? sizeP : 1.0 );
    vec3  world, n;
    vMirror = is_mirror ? 1.0 : 0.0;
    vAim = vec3( 0.0, 1.0, 0.0 );

    if ( ( is_tower || is_bg ) && inst > 0 )
    {
        gl_Position = vec4( 0.0, 0.0, 2.0, 1.0 );
        vNormal = vec3( 0.0, 1.0, 0.0 );
        vPos = vec3( 0.0 );
        vUV = vec2( 0.0 );
        vLocal = vec3( 0.0 );
        vBg = is_bg ? 1.0 : 0.0;
        return;
    }

    if ( is_tower )
    {
        float      sz_t = 0.5 * TowerH * sz;
        vec3       c = attrA.xyz - meshCenter;
        float      mx = max( meshExtent.x, max( meshExtent.y, meshExtent.z ) );
        vec3       local = c / mx * sz_t;
        const mat3 turn_m = mat3( -1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, -1.0 );
        world = turn_m * local + TowerFoot + vec3( 0.0, meshExtent.y / mx * sz_t, 0.0 );
        n = normalize( turn_m * attrB.xyz );
        vUV = vec2( attrA.w, attrB.w );
        vLocal = c / meshExtent;
    }
    else if ( is_mirror )
    {
        float k = float( inst );
        // The field: quasi-random angle over the near 220 degrees, radius
        // spread as sqrt for an even density, never inside the tower's ring.
        float a = ( fract( k * 0.6180340 ) - 0.5 ) * 3.8;
        float r = 26.0 + 118.0 * sqrt( fract( k * 0.7548777 + 0.31 ) );
        vec3  pos = TowerFoot + vec3( r * sin( a ), 0.0, -r * cos( a ) );

        float sz_m = 2.2 * sz * ( mirrorP > 0.01 ? mirrorP : 1.0 );
        vec3  c = attrA.xyz - meshCenter2;
        float mx = max( meshExtent2.x, max( meshExtent2.y, meshExtent2.z ) );
        vec3  local = c / mx * sz_m;

        vec3 recv = TowerFoot + vec3( 0.0, TowerH * 0.82, 0.0 );
        vec3 to_recv = normalize( recv - pos );
        vec3 nrm = normalize( to_recv + sunDir() );
        vAim = nrm;
        vec3 right = normalize( cross( vec3( 0.0, 1.0, 0.0 ), nrm ) );
        vec3 up2 = cross( nrm, right );
        mat3 aim_m = mat3( right, up2, nrm );

        world = aim_m * local + pos + vec3( 0.0, meshExtent2.y / mx * sz_m, 0.0 );
        n = normalize( aim_m * attrB.xyz );
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
    if ( is_bg )
        gl_Position.z = gl_Position.w * 0.999999;

    vNormal = n;
    vPos = world;
    vBg = is_bg ? 1.0 : 0.0;
}
