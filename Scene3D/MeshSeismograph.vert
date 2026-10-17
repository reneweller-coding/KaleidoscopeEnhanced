#version 330 core
/*****************************************************************************\
 *                              MeshSeismograph.vert
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Vertex stage companion to MeshSeismograph.frag -- see that file's header.
 *
 *  Two models: the instrument's base with its pen arm (model=), held still, and the recording drum (model2=),
 *  turning about its horizontal axle on time at the rate the fragment stage assumes when it draws the trace. The
 *  drum's place beside the pen is set by three fractions of the base's extents (drumXP/YP/ZP), tuned once against
 *  the models.
 *
 *  @author René Weller
 */

in vec4 attrA; ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an
               ///< index).
in vec4 attrB; ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

uniform mat4  projM;            ///< Projection matrix.
uniform float eyeOff;           ///< Stereo eye offset (0 in mono).
uniform float time;             ///< Seconds since this activation, plus a rolled start (see sceneTime).
uniform int   meshVertexCount;  ///< Vertices of the scene's mesh.
uniform int   mesh2VertexCount; ///< Vertices of the scene's second mesh.
uniform vec3  meshExtent;       ///< Half size of the scene's mesh bounding box.
uniform vec3  meshCenter;       ///< Centre of the scene's mesh bounding box.
uniform vec3  meshExtent2;      ///< Half size of the second mesh's bounding box.
uniform vec3  meshCenter2;      ///< Centre of the second mesh's bounding box.

uniform float sizeP;  ///< Size knob, 0..1.
uniform float drumP;  ///< drum size relative to the base (default 0.45)
uniform float drumXP; ///< drum centre across the base, fraction of its half-width
uniform float drumYP; ///< drum centre height, fraction of the base's full height
uniform float drumZP; ///< drum centre depth, fraction of the base's half-depth

out vec2  vUV;     ///< Texture coordinate 0..1 over the screen (from the vertex stage).
out vec3  vNormal; ///< Surface normal (from the vertex stage).
out vec3  vPos;    ///< Position (from the vertex stage).
out vec3  vLocal;  ///< Object-space position (from the vertex stage).
out float vBg;     ///< Background flag (from the vertex stage).
out float vDrum;   ///< Drum (from the vertex stage).
out float vTurn;   ///< Turn (from the vertex stage).

const float Dist = 46.0;    ///< Distance of the main object from the camera (world units).
const float Ground = -16.0; ///< Height of the ground (world units).
const float Rate = 0.35;    ///< radians per second, shared with the fragment stage

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    bool is_base = gl_VertexID < meshVertexCount;
    bool is_drum = gl_VertexID >= meshVertexCount && gl_VertexID < mesh2VertexCount;
    bool is_bg = gl_VertexID >= mesh2VertexCount;
    vec3 world, n;
    vDrum = is_drum ? 1.0 : 0.0;
    vTurn = time * Rate;

    float      sz = 19.0 * ( sizeP > 0.01 ? sizeP : 1.0 ); // 19 (17.10.2026): at 14 the drum and its trace were small
    float      mx_b = max( meshExtent.x, max( meshExtent.y, meshExtent.z ) );
    vec3       base_half = meshExtent / mx_b * sz;
    const mat3 turn_m = mat3( -1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, -1.0 );

    if ( is_base )
    {
        vec3 c = attrA.xyz - meshCenter;
        world = turn_m * ( c / mx_b * sz ) + vec3( 0.0, Ground + base_half.y, Dist );
        n = normalize( turn_m * attrB.xyz );
        vUV = vec2( attrA.w, attrB.w );
        vLocal = c / meshExtent;
    }
    else if ( is_drum )
    {
        float sz_d = sz * ( drumP > 0.01 ? drumP : 0.45 );
        vec3  c = attrA.xyz - meshCenter2;
        float mx = max( meshExtent2.x, max( meshExtent2.y, meshExtent2.z ) );
        vec3  local = c / mx * sz_d;
        // Turn about the axle (the model's longest axis, x), then lay the
        // axle along world Z so it runs under the pen arm, which the base
        // model carries along X.
        float ang = vTurn;
        float ca = cos( ang ), sa = sin( ang );
        mat3  rot_x = mat3( 1.0, 0.0, 0.0, 0.0, ca, sa, 0.0, -sa, ca );
        // The axle stays along X: seen end-on (axle along Z) the drum is a
        // disc and the paper is hidden. The pen tip sits on the drum's top.
        mat3 M = rot_x;
        vec3 centre = vec3( drumXP * base_half.x, Ground + drumYP * 2.0 * base_half.y, Dist - drumZP * base_half.z );
        world = M * local + centre;
        n = normalize( M * attrB.xyz );
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
