#version 330 core
/*****************************************************************************\
 *                              ShipDocking.vert
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Vertex stage companion to ShipDocking.frag -- see that file's header.
 *
 *  The first scene to use TWO loaded meshes, so the buffer has three runs and gl_VertexID picks between them:
 *
 *    [0, meshVertexCount)             the station (model=),  held still
 *    [meshVertexCount, mesh2VertexCount) the ship (model2=), flying the approach
 *    [mesh2VertexCount, ...)          the sky shell
 *
 *  The ship is scaled to a FRACTION of the station (shipScaleP, ~0.1), which
 *  is the whole point: both meshes arrive normalised to a unit box by the
 *  generator, so drawn at equal scale a shuttle and a kilometres-wide station
 *  come out the same size and the shot says nothing. The size difference IS
 *  the story here.
 *
 *  The approach is staged on `sceneProgress` and eased out (1-(1-t)^3), so
 *  the ship closes fast from a distance and settles gently into the dock in
 *  the last moments -- and it does that across whatever screen time the
 *  scheduler gave the scene, not a fixed wall-clock duration.
 *
 *  @author René Weller
 */

in vec4 attrA; ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an
               ///< index).
in vec4 attrB; ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

uniform mat4  projM;             ///< Projection matrix.
uniform float eyeOff;            ///< Stereo eye offset (0 in mono).
uniform float time;              ///< Seconds since this activation, plus a rolled start (see sceneTime).
uniform int   meshVertexCount;   ///< Vertices of the scene's mesh.
uniform vec3  meshExtent;        ///< half-extents of model 1 (the station)
uniform vec3  meshExtent2;       ///< half-extents of model 2 (the ship)
uniform mat3  meshOrient2;       ///< Rotation of model 2 into its craft frame (nose +Z, up +Y).
uniform vec3  meshOrientExtent2; ///< Half-extents of model 2 in its craft frame.
uniform vec3  meshOrientCenter2; ///< Centre of model 2 in its craft frame.
uniform int   mesh2VertexCount;  ///< Vertices of the scene's second mesh.
uniform float sceneProgress;     ///< Progress through this scene's solo time, 0..1.

uniform float audioAdvance; ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                            ///< backwards).
uniform float audioKick;    ///< Kick-drum envelope, 0..1 (fast attack, short decay).

uniform float sizeP;      ///< station scale
uniform float shipScaleP; ///< ship size AS A FRACTION of the station
uniform float spinP;      ///< station spin (0 for a non-rotating hull)
uniform float spinAxisP;  ///< The station's own axis it spins about: 0 = X, 1 = Y, 2 = Z (see axisSpin()).

out vec2  vUV;       ///< Texture coordinate 0..1 over the screen (from the vertex stage).
out vec3  vNormal;   ///< Surface normal (from the vertex stage).
out vec3  vPos;      ///< Position (from the vertex stage).
out vec3  vLocalPos; ///< Object-space position (from the vertex stage).
out float vBg;       ///< Background flag (from the vertex stage).
out float vShip;     ///< 1 on the ship, 0 on the station -- the frag stage lights them differently
out float vApproach; ///< 0 far out, 1 docked; drives thruster and floodlight intensity

/**  Rotation about one of the model's own object-space axes.
 *
 * @param axis  The axis: 0 = x, 1 = y, 2 = z. (in)
 * @param ang   The angle in radians. (in)
 *
 * @return
 *   The rotation matrix.
 *
 * spinAxisP is set per station to the axis its hull is rotationally symmetric about (17.10.2026): every docking
 * station spun about its object Z, which for the cylinder of TradePromenadeStation and the ring of
 * MegastructureCentralHub (both round about Y) turned the station end over end.
 **/
mat3 axisSpin( float axis, float ang )
{
    float c = cos( ang ), s = sin( ang );
    if ( axis < 0.5 )
        return mat3( 1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c );
    if ( axis < 1.5 )
        return mat3( c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c );
    return mat3( c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0 );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec3 world, n;
    bool is_station = gl_VertexID < meshVertexCount;
    bool is_ship = gl_VertexID >= meshVertexCount && gl_VertexID < mesh2VertexCount;
    bool is_bg = gl_VertexID >= mesh2VertexCount;

    float sz = ( sizeP > 0.01 ? sizeP : 1.0 );
    float t = sceneProgress;
    float ease = 1.0 - pow( 1.0 - t, 3.0 ); // fast approach, gentle arrival

    vApproach = ease;
    vShip = is_ship ? 1.0 : 0.0;

    // STAGING NOTE. A truthful size ratio makes this shot unreadable: at a
    // realistic shuttle-to-station scale the ship covers a couple of pixels
    // and simply cannot be seen. The compromise here is the one live-action
    // effects work uses -- keep the station large and far so it LOOMS, and
    // bring the ship much closer to the camera so perspective gives it back
    // some screen size. The ship still reads as roughly a fifth of the
    // station on screen while being nowhere near that fraction in world
    // units, which is what sells the difference without hiding the subject.
    if ( is_station )
    {
        vec3 local = attrA.xyz * ( 90.0 * sz );
        // A station may rotate about its own axis (spin gravity) but never
        // tumbles -- see the station families for the reasoning.
        float sp = ( spinP > 0.001 ? spinP : 0.0 );
        // Rotation on TIME alone. audioAdvance integrates a beat-driven rate,
        // so anything it turns visibly speeds up on every kick -- measured as
        // residual beat-periodic motion (autocorr 0.46 @ 1s) after every other
        // coupling was removed. The summed coefficient keeps the average pace.
        mat3        spin_m = axisSpin( spinAxisP, time * 0.11 * sp );
        const float tilt_x = 0.35;
        float       cx = cos( tilt_x ), sx = sin( tilt_x );
        mat3        tilt_m = mat3( 1.0, 0.0, 0.0, 0.0, cx, sx, 0.0, -sx, cx );
        mat3        rot_m = tilt_m * spin_m;

        world = rot_m * local;
        world.x += 10.0;
        world.z += 150.0;
        n = normalize( rot_m * attrB.xyz );
        vUV = vec2( attrA.w, attrB.w );
        vLocalPos = attrA.xyz;
    }
    else if ( is_ship )
    {
        float shs = ( shipScaleP > 0.001 ? shipScaleP : 0.26 );
        // The ship in its own frame (Engine/model_orient.tsv, model2): nose +Z, up +Y, centred, one unit long, then a
        // quarter turn about Y puts the nose on +X (17.10.2026).  The longest box axis had been taken for the
        // direction of travel, with whichever sign the file happened to have.
        vec3  e = meshOrientExtent2;
        float fit = 0.5 / max( max( e.x, e.y ), e.z );
        vec3  q = ( meshOrient2 * attrA.xyz - meshOrientCenter2 ) * fit;
        vec3  qn = meshOrient2 * attrB.xyz;
        vec3  p = vec3( q.z, q.y, -q.x ), nrm = vec3( qn.z, qn.y, -qn.x );
        vec3  local = p * ( 90.0 * sz * shs );

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
        vec3 start = vec3( -150.0, -58.0, 196.0 );
        // The dock sits on the station's NEAR face (the station spans roughly
        // z 106..194 at this scale), not its centre -- that keeps the ship
        // closer to the camera at the end of the run, where it needs the
        // screen size most.
        vec3 dock = vec3( -38.0, -6.0, 124.0 );
        world = mix( start, dock, ease );
        world.y += 9.0 * sin( ease * 3.14159 ) * ( 1.0 - ease * 0.5 ); // arc over

        // Nose along the approach -- right, up and TOWARD the camera, (112, 52, -72) -- levelling out and turning
        // parallel to the station's face as it arrives.  The yaw had the wrong sign: the nose pointed away from the
        // camera while the ship came toward it, and the ship backed into the dock.
        float yaw = 0.57 * ( 1.0 - 0.7 * ease );
        float pit = 0.30 * ( 1.0 - ease );
        float cy = cos( yaw ), sy = sin( yaw ), cpi = cos( pit ), spi = sin( pit );
        mat3  yaw_m = mat3( cy, 0.0, -sy, 0.0, 1.0, 0.0, sy, 0.0, cy );
        mat3  pit_m = mat3( cpi, spi, 0.0, -spi, cpi, 0.0, 0.0, 0.0, 1.0 );
        world += yaw_m * pit_m * local;
        n = normalize( yaw_m * pit_m * nrm );
        vUV = vec2( attrA.w, attrB.w );
        vLocalPos = q; // the craft frame (nose +Z): the frag finds the engines at its -Z end
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
    if ( is_bg )
        gl_Position.z = gl_Position.w * 0.999999;

    vNormal = n;
    vPos = world;
    vBg = is_bg ? 1.0 : 0.0;
}
