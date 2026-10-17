#version 330 core
/*****************************************************************************\
 *                              Spaceship.vert
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Vertex stage companion to Spaceship.frag -- see that file's header for this scene's description.
 *
 *  geom="mesh": attrA/attrB carry a REAL loaded model's position/UV/normal (see Tools/SHADER_AUTHORING.md's `mesh`
 *  row), not a procedural pattern. gl_VertexID picks the vertex's own branch: below meshVertexCount it is the
 *  loaded model, at or above it the enclosing sky shell Scene3DShader::buildGeometry() appends -- Spaceship.frag
 *  paints a nebula onto it.
 *
 *  @author René Weller
 */

in vec4 attrA; ///< mesh: xyz = object-space position, w = U.  shell: xyz = world-space position on the shell.
in vec4 attrB; ///< mesh: xyz = object-space normal,   w = V.  shell: xyz = outward direction (reused as "sky
               ///< direction").

uniform mat4  projM;            ///< Projection matrix.
uniform float eyeOff;           ///< Stereo eye offset (0 in mono).
uniform float time;             ///< Seconds since this activation, plus a rolled start (see sceneTime).
uniform int   meshVertexCount;  ///< Vertices of the scene's mesh.
uniform mat3  meshOrient;       ///< Rotation into the craft frame (nose +Z, up +Y), Engine/model_orient.tsv.
uniform vec3  meshOrientExtent; ///< Half-extents in the craft frame.
uniform vec3  meshOrientCenter; ///< Centre in the craft frame.

uniform float audioAdvance; ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                            ///< backwards).
uniform float audioKick;    ///< Kick-drum envelope, 0..1 (fast attack, short decay).

out vec2  vUV;     ///< Texture coordinate 0..1 over the screen (from the vertex stage).
out vec3  vNormal; ///< Surface normal (from the vertex stage).
out vec3  vPos;    ///< Position (from the vertex stage).
out float vBg;     ///< Background flag (from the vertex stage).
out vec3  vLight;  ///< Direction to the star in view space (it stays put in the world as the camera orbits).

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec3 world, n;
    bool is_bg = gl_VertexID >= meshVertexCount;

    // The CAMERA orbits the ship, slowly, at a gently changing elevation (17.10.2026).  The ship itself turned like a
    // model on a turntable -- a full turn every 14 s against a fixed sky -- which a warship holding station never
    // does.  Now the ship, the sky and the light keep their places in the world and only the view goes round: the
    // same rotation turns the ship and, inverted, the sky directions (at infinity, so its centre does not matter).
    // Time alone (audioAdvance jerks on kicks); a full orbit takes about a minute.
    float orbit = 0.7 + time * 0.10;
    float elev = 0.20 + 0.08 * sin( time * 0.05 );
    float co = cos( orbit ), so = sin( orbit ), ce = cos( elev ), se = sin( elev );
    mat3  orbit_m = mat3( co, 0.0, -so, 0.0, 1.0, 0.0, so, 0.0, co );
    mat3  elev_m = mat3( 1.0, 0.0, 0.0, 0.0, ce, se, 0.0, -se, ce );
    mat3  rot_mat = elev_m * orbit_m;

    if ( !is_bg )
    {
        // The craft in its own frame (Engine/model_orient.tsv): nose +Z, up +Y, centred, one unit long.
        vec3  e = meshOrientExtent;
        float fit = 1.0 / max( max( e.x, e.y ), e.z ) * 0.5;
        vec3  q = ( meshOrient * attrA.xyz - meshOrientCenter ) * fit;
        // 70 units long at 90 units: about two fifths of the frame width.
        vec3 local = q * 70.0;

        world = rot_mat * local;
        world.z += 90.0; // push out in front of the camera
        // The slow drift stays; the +2*audioKick hop does not. A hull jerking
        // in time reads as a glitch, not as reactivity (reported) -- the beat
        // belongs to the engine glow and the background, not the ship's mass.
        world.y += 4.0 * sin( time * 0.2 );
        n = normalize( rot_mat * ( meshOrient * attrB.xyz ) );
        vUV = vec2( attrA.w, attrB.w );
        vPos = world;
    }
    else
    {
        world = attrA.xyz;
        n = attrB.xyz;
        vUV = vec2( 0.0 );
        vPos = transpose( rot_mat ) * world; // the sky's own direction for this view direction
    }
    vLight = rot_mat * normalize( vec3( 0.4, 0.6, -0.5 ) ); // the star, fixed in the world

    vec3 vp = world;
    vp.x -= eyeOff;
    gl_Position = projM * vec4( vp.x, vp.y, -vp.z, 1.0 );
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
    // The shell is a CUBE of half-side kSkyShellRadius, so its corners sit
    // sqrt(3) times further out than its faces -- past kSceneFar, which
    // clipped visible wedges out of the sky. Pinning shell depth just inside
    // the far plane is the standard skybox fix: no far-plane clipping however
    // big the shell is, and it can never occlude the object in front of it.
    if ( is_bg )
        gl_Position.z = gl_Position.w * 0.999999;

    vNormal = n;
    vBg = is_bg ? 1.0 : 0.0;
}
