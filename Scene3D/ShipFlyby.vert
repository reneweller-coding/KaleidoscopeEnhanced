#version 330 core
/*****************************************************************************\
 *                              ShipFlyby.vert
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Vertex stage companion to ShipFlyby.frag -- see that file's header.
 *
 *  The whole point of this scene is the PASS, and a pass has a beginning, a
 *  middle and an end, so it is staged on `sceneProgress` (0 at activation, 1
 *  when the scene's solo time runs out) rather than on `time`. The ship is
 *  therefore off-frame at both ends and closest at the halfway mark no matter
 *  how long the scheduler happens to give this scene -- which is exactly the
 *  "passage length tied to the scene length" behaviour asked for. Driving it
 *  off `time` instead would make a short scene show a fragment of the pass
 *  and a long one show the ship leave and never come back.
 *
 *  Each craft lies in its own frame from Engine/model_orient.tsv (Tools/model_orient.py): nose +Z, up +Y, sized
 *  without the generator's threads; a quarter turn about Y puts the nose on the direction of travel.
 *
 *  @author René Weller
 */

in vec4 attrA; ///< mesh: xyz = object-space position, w = U.  shell: xyz = world-space position on the shell.
in vec4 attrB; ///< mesh: xyz = object-space normal,   w = V.  shell: xyz = outward direction.

uniform mat4  projM;            ///< Projection matrix.
uniform float eyeOff;           ///< Stereo eye offset (0 in mono).
uniform float time;             ///< Seconds since this activation, plus a rolled start (see sceneTime).
uniform int   meshVertexCount;  ///< Vertices of the scene's mesh.
uniform vec3  meshExtent;       ///< half-extents of model 1, object space
uniform mat3  meshOrient;       ///< Rotation into the craft frame (nose +Z, up +Y), Engine/model_orient.tsv.
uniform vec3  meshOrientExtent; ///< Half-extents in the craft frame, without the generator's threads.
uniform vec3  meshOrientCenter; ///< Centre in the craft frame.
uniform float sceneProgress;    ///< 0 at activation -> 1 at the end of the solo span

uniform float audioKick;  ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSwell; ///< Slow loudness envelope, 0..1 (seconds).

uniform float sizeP;     ///< ship scale: the hull is 40 x sizeP long, its distance scales with it
uniform float travelP;   ///< how far it sweeps sideways
uniform float approachP; ///< how much closer it comes at mid-pass
uniform float bankP;     ///< roll into the pass
uniform float hueP;      ///< Hue knob (radians, rolled per activation): here also which way the ship flies.

out vec2  vUV;       ///< Texture coordinate 0..1 over the screen (from the vertex stage).
out vec3  vNormal;   ///< Surface normal (from the vertex stage).
out vec3  vPos;      ///< Position (from the vertex stage).
out vec3  vLocalPos; ///< Object-space position (from the vertex stage).
out float vBg;       ///< Background flag (from the vertex stage).

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec3 world, n;
    bool is_bg = gl_VertexID >= meshVertexCount;
    if ( !is_bg )
    {
        float sz = ( sizeP > 0.01 ? sizeP : 1.0 );
        float app = clamp( approachP > 0.01 ? approachP : 1.0, 0.5, 1.0 );

        // The craft in its own frame (Engine/model_orient.tsv): nose +Z, up +Y, centred, sized without the
        // generator's threads (17.10.2026).  The longest box axis was taken for the direction of travel, with
        // whichever sign the file happened to have -- some ships flew stern first -- and the raw coordinates set the
        // size, so a model 2.0 long in its file came out twice the size of one 1.0 long.
        vec3  e = meshOrientExtent;
        float fit = 0.5 / max( max( e.x, e.y ), e.z );
        vec3  q = ( meshOrient * attrA.xyz - meshOrientCenter ) * fit; // +-0.5 along the longest axis
        vec3  qn = meshOrient * attrB.xyz;
        // Quarter turn about Y: the nose (+Z) onto +X, the direction of travel.
        vec3 p = vec3( q.z, q.y, -q.x );
        vec3 nrm = vec3( qn.z, qn.y, -qn.x );

        float L = 40.0 * sz; // the hull's length
        vec3  local = p * L;

        // The pass (17.10.2026): a straight run at constant speed and heading, the way a mass under way moves -- in
        // from the distance on one side, past the camera, out at the other side -- across the whole solo
        // (sceneProgress ends with the solo the scheduler really gives): the bow enters at one edge as the scene
        // opens and the stern leaves the other as it closes.  The heading is fixed; what turns is only the view, from
        // three-quarters ahead to three-quarters astern.  The ship had followed a parabola and turned with it, and
        // came within 0.95 hull lengths of the lens.
        //
        // Course angle phi toward the camera: the line's vanishing point sits at -1 / tan( phi ) off the left edge,
        // so the ship enters from off screen.  z_near is the depth at the line's foot (screen centre); the hull fills
        // at most about 60 % of the frame width as it leaves (depth 0.71 z_near there).
        const float phi = 0.35, K = 1.15; // K: just off the edge, in units of the half-width per depth (0.925 at 16:9)
        float       cphi = cos( phi ), sphi = sin( phi );
        float       z_near = 1.28 * L / clamp( app, 0.5, 1.0 ) + 6.0;
        float       s_in = -K * z_near / ( cphi - K * sphi ), s_out = K * z_near / ( cphi + K * sphi );
        float       s = mix( s_in, s_out, sceneProgress );
        float       side = ( hueP > 3.14159 ) ? -1.0 : 1.0; // which way, per activation
        float       z = z_near - s * sphi;
        float       x = s * cphi * side;

        // Heading: the nose (+X) along the course (cos phi, 0, -sin phi), mirrored for the other side.
        float yaw = ( side > 0.0 ) ? phi : 3.14159265 - phi;
        float cy = cos( yaw ), sy = sin( yaw );
        mat3  yaw_m = mat3( cy, 0.0, -sy, 0.0, 1.0, 0.0, sy, 0.0, cy );
        // A held bank and a touch of nose-up pitch, for a three-quarter view of the hull: ships on a straight run
        // keep their attitude.  The nose is on +X: rolling is a rotation about X, pitching one about Z.
        float bank = -0.12 * bankP;
        float pitch = 0.06;
        float cb = cos( bank ), sb = sin( bank );
        float cp = cos( pitch ), sp2 = sin( pitch );
        mat3  bank_m = mat3( 1.0, 0.0, 0.0, 0.0, cb, sb, 0.0, -sb, cb );
        mat3  pitch_m = mat3( cp, sp2, 0.0, -sp2, cp, 0.0, 0.0, 0.0, 1.0 );
        mat3  rot_m = yaw_m * pitch_m * bank_m;

        world = rot_m * local;
        world.x += x;
        world.z += z;
        // Below the eye line by a fixed angle (proportional to the depth: still a straight line).  A thousand-ton ship
        // in vacuum does not hop (the old +1.5*audioKick bounced it on every beat); the music stays on the ENGINES.
        world.y += -0.12 * z;
        n = normalize( rot_m * nrm );
        vUV = vec2( attrA.w, attrB.w );
        vLocalPos = q; // the craft frame, +-0.5: the frag finds the engines at its -Z end
    }
    else
    {
        world = attrA.xyz;
        n = attrB.xyz;
        vUV = vec2( 0.0 );
        vLocalPos = vec3( 0.0 );
    }

    vec3 vp = world;
    vp.x -= eyeOff;
    gl_Position = projM * vec4( vp.x, vp.y, -vp.z, 1.0 );
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
    // Shell cube corners reach sqrt(3)*radius, past the far plane; pin their
    // depth just inside it (see Tools/SHADER_AUTHORING.md's mesh section).
    if ( is_bg )
        gl_Position.z = gl_Position.w * 0.999999;

    vNormal = n;
    vPos = world;
    vBg = is_bg ? 1.0 : 0.0;
}
