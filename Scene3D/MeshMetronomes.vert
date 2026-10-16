#version 330 core
/**
 * @file MeshMetronomes.vert
 * @brief Vertex stage companion to MeshMetronomes.frag -- see that file's
 * header. Two models drawn instances="12" times: the metronome body
 * (model=) and, as its pendulum rod, the lab pendulum (model2=) turned
 * upside down so its brass sphere becomes the sliding weight. gl_InstanceID
 * places body and rod on a bench in two rows; every rod swings about the
 * pivot at the foot of its body at its own tempo, on time. The shell is
 * drawn by instance 0 only.
 */

in vec4 attrA; ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an
               ///< index).
in vec4 attrB; ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

uniform mat4  projM;           ///< Projection matrix.
uniform float eyeOff;          ///< Stereo eye offset (0 in mono).
uniform float time;            ///< Seconds since the program started (never reset; see sceneTime).
uniform int   meshVertexCount; ///< Vertices of the scene's mesh.
uniform int   mesh2VertexCount;
uniform int   meshInstances; ///< Number of mesh instances.
uniform vec3  meshExtent;    ///< Half size of the scene's mesh bounding box.
uniform vec3  meshCenter;    ///< Centre of the scene's mesh bounding box.
uniform vec3  meshExtent2;
uniform vec3  meshCenter2;

uniform float sizeP;  ///< Size knob, 0..1.
uniform float armP;   ///< rod length relative to the body height (default 0.75)
uniform float pivotP; ///< pivot height as a fraction of the body height (default 0.22)
uniform float frontP; ///< rod offset in front of the body as a fraction of its half-depth (default 1.2)

out vec2  vUV;     ///< Texture coordinate 0..1 over the screen (from the vertex stage).
out vec3  vNormal; ///< Surface normal (from the vertex stage).
out vec3  vPos;    ///< Position (from the vertex stage).
out vec3  vLocal;  ///< Object-space position (from the vertex stage).
out float vBg;     ///< Background flag (from the vertex stage).
out float vInst;
out float vArm;
out float vSwing;

const float Ground = -14.0;

/**  Pseudo-random number 0..1 from a float.
 *
 * @param p  The input value. (in)
 *
 * @return
 *   A pseudo-random number 0..1.
 **/
float hash11( float p )
{
    return fract( sin( p * 12.9898 ) * 43758.5453 );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    int  inst = gl_InstanceID;
    bool is_body = gl_VertexID < meshVertexCount;
    bool is_arm = gl_VertexID >= meshVertexCount && gl_VertexID < mesh2VertexCount;
    bool is_bg = gl_VertexID >= mesh2VertexCount;
    vec3 world, n;
    vInst = float( inst );
    vArm = is_arm ? 1.0 : 0.0;
    vSwing = 0.0;

    if ( is_bg && inst > 0 )
    {
        gl_Position = vec4( 0.0, 0.0, 2.0, 1.0 );
        vNormal = attrB.xyz;
        vPos = attrA.xyz;
        vUV = vec2( 0.0 );
        vLocal = vec3( 0.0 );
        vBg = 1.0;
        return;
    }

    float      fi = float( inst );
    int        row = inst / 6;
    int        j = inst - row * 6;
    float      sz = 6.0 * ( sizeP > 0.01 ? sizeP : 1.0 );
    float      body_h = 2.0 * sz;
    vec3       pos = vec3( ( float( j ) - 2.5 ) * 13.0 + float( row ) * 6.5, Ground, 44.0 + float( row ) * 16.0 );
    const mat3 turn_m = mat3( -1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, -1.0 );

    if ( is_body )
    {
        vec3  c = attrA.xyz - meshCenter;
        float mx = max( meshExtent.x, max( meshExtent.y, meshExtent.z ) );
        vec3  local = c / mx * sz;
        world = turn_m * local + pos + vec3( 0.0, meshExtent.y / mx * sz, 0.0 );
        n = normalize( turn_m * attrB.xyz );
        vUV = vec2( attrA.w, attrB.w );
        vLocal = c / meshExtent;
    }
    else if ( is_arm )
    {
        float arm = ( armP > 0.01 ? armP : 0.75 );
        float sz_a = 0.5 * body_h * arm;
        vec3  c = attrA.xyz - meshCenter2;
        float mx = max( meshExtent2.x, max( meshExtent2.y, meshExtent2.z ) );
        vec3  local = c / mx * sz_a;
        // Upside down: the sphere up, the bracket at the pivot.
        const mat3 flip_m = mat3( -1.0, 0.0, 0.0, 0.0, -1.0, 0.0, 0.0, 0.0, 1.0 );
        local = flip_m * local;
        local.y += meshExtent2.y / mx * sz_a; // pivot at the bottom

        float bpm = 52.0 + 150.0 * hash11( fi * 2.17 + 0.4 );
        float s = sin( 6.2831853 * time * bpm / 60.0 + fi );
        vSwing = s;
        float ang = 0.40 * s;
        float ca = cos( ang ), sa = sin( ang );
        mat3  rot_z = mat3( ca, sa, 0.0, -sa, ca, 0.0, 0.0, 0.0, 1.0 );

        float mx_b = max( meshExtent.x, max( meshExtent.y, meshExtent.z ) );
        float depth = meshExtent.z / mx_b * sz;
        float pivot_y = ( pivotP > 0.01 ? pivotP : 0.22 ) * body_h;
        float front = ( frontP > 0.01 ? frontP : 1.2 );
        world = rot_z * local + pos + vec3( 0.0, pivot_y, -depth * front );
        n = normalize( rot_z * flip_m * attrB.xyz );
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
