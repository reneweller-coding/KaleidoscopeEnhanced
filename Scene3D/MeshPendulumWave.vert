#version 330 core
/*****************************************************************************\
 *                              MeshPendulumWave.vert
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Vertex stage companion to MeshPendulumWave.frag -- see that file's header.
 *
 *  ONE pendulum drawn twelve times (instances="12") in a row, each swinging about its own pivot at the top of the
 *  frame with its own period: the n-th makes n/8 more swings than the first per cycle, so the row drifts from a
 *  line into a travelling wave, into two counter-waves, into chaos and back into a line. The swings run on time
 *  (never on a beat tracker, so no resync can jolt them); only the amplitude eases with the swell.
 *
 *  @author René Weller
 */

in vec4 attrA; ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an
               ///< index).
in vec4 attrB; ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

uniform mat4  projM;           ///< Projection matrix.
uniform float eyeOff;          ///< Stereo eye offset (0 in mono).
uniform float time;            ///< Seconds since this activation, plus a rolled start (see sceneTime).
uniform int   meshVertexCount; ///< Vertices of the scene's mesh.
uniform int   meshInstances;   ///< Number of mesh instances.
uniform vec3  meshExtent;      ///< Half size of the scene's mesh bounding box.
uniform vec3  meshCenter;      ///< Centre of the scene's mesh bounding box.

uniform float audioSwell; ///< Slow loudness envelope, 0..1 (seconds).

uniform float sizeP;  ///< Size knob, 0..1.
uniform float cycleP; ///< seconds per full pattern cycle (default 40)

out vec2  vUV;     ///< Texture coordinate 0..1 over the screen (from the vertex stage).
out vec3  vNormal; ///< Surface normal (from the vertex stage).
out vec3  vPos;    ///< Position (from the vertex stage).
out vec3  vLocal;  ///< Object-space position (from the vertex stage).
out float vBg;     ///< Background flag (from the vertex stage).
out float vInst;   ///< Inst (from the vertex stage).
out float vSwing;  ///< -1..1: where in its swing this pendulum is

const float Dist = 70.0;    ///< Distance of the main object from the camera (world units).
const float PivotY = 22.0;  ///< Height of the pivots (world units).
const float Spacing = 10.5; ///< Spacing between neighbouring objects (world units).

// ---- shadow map of the scene's lamp (Tools/scenegen/patch_shadow3d.py) ----
uniform float shadowPass;                          ///< 1 during the shadow map's depth-only pass.
const vec3    SmLamp = vec3( 0.0, 0.8, -0.6 );     ///< Toward the lamp main() shades with.
const vec3    SmCentre = vec3( 0.0, -20.0, Dist ); ///< Centre of the shadow box (world units).
const float   SmBox = 70.0;                        ///< Half size of the shadow box (world units).

/**  A point in the clip space of the lamp's shadow map: an orthographic view along the lamp onto the box around
 * SmCentre.
 *
 * @param p  The point (world units). (in)
 *
 * @return
 *   Its clip coordinates (w = 1).
 *
 * The construction of RenderPipeline::updateLightMatrixGeneric() -- eye 2 SmBox out along the lamp, looking at the
 * box centre, near 0.1, far 4 SmBox -- but along the scene's own lamp, so the shadows fall where its light says.
 **/
vec4 smClip( vec3 p )
{
    vec3  l = normalize( SmLamp );
    vec3  f = -l;
    vec3  up = ( abs( f.y ) > 0.98 ) ? vec3( 1.0, 0.0, 0.0 ) : vec3( 0.0, 1.0, 0.0 );
    vec3  s = normalize( cross( f, up ) );
    vec3  u = cross( s, f );
    vec3  q = p - SmCentre - l * ( 2.0 * SmBox );
    float zn = 0.1, zf = 4.0 * SmBox;
    return vec4( dot( q, s ) / SmBox, dot( q, u ) / SmBox, ( 2.0 * dot( q, f ) - zf - zn ) / ( zf - zn ), 1.0 );
}
// ---- end of the shadow map ----

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    int  inst = gl_InstanceID;
    bool is_bg = gl_VertexID >= meshVertexCount;
    vec3 world, n;
    vInst = float( inst );
    vSwing = 0.0;
    if ( !is_bg )
    {
        float sz = 11.0 * ( sizeP > 0.01 ? sizeP : 1.0 );
        vec3  c = attrA.xyz - meshCenter;
        float mx = max( meshExtent.x, max( meshExtent.y, meshExtent.z ) );
        vec3  local = c / mx * sz;
        float top = meshExtent.y / mx * sz;
        local.y -= top; // pivot at the bracket

        float swell = clamp( audioSwell, 0.0, 1.0 );
        float cyc = ( cycleP > 1.0 ? cycleP : 40.0 );
        float f = ( 8.0 + float( inst ) ) / cyc;
        float s = sin( 6.2831853 * f * time + 0.4 );
        float amp = 0.34 * ( 0.65 + 0.35 * swell );
        float ang = amp * s;
        vSwing = s;
        float      ca = cos( ang ), sa = sin( ang );
        mat3       rot_z = mat3( ca, sa, 0.0, -sa, ca, 0.0, 0.0, 0.0, 1.0 );
        const mat3 turn_m = mat3( -1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, -1.0 );
        mat3       M = rot_z * turn_m;

        float x = ( float( inst ) - 5.5 ) * Spacing;
        world = M * local + vec3( x, PivotY, Dist );
        n = normalize( M * attrB.xyz );
        vUV = vec2( attrA.w, attrB.w );
        vLocal = c / meshExtent;
    }
    else
    {
        world = attrA.xyz;
        n = attrB.xyz;
        vUV = vec2( 0.0 );
        vLocal = vec3( 0.0 );
        if ( inst > 0 )
        {
            gl_Position = vec4( 0.0, 0.0, 2.0, 1.0 );
            vNormal = n;
            vPos = world;
            vBg = 1.0;
            return;
        }
    }

    if ( shadowPass > 0.5 )
    {
        // The shadow map's depth pass (patch_shadow3d.py): the objects through the lamp's view, never the sky.
        gl_Position = is_bg ? vec4( 0.0, 0.0, 2.0, 1.0 ) : smClip( world );
        return;
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
