#version 330 core
/**
 * @file SolarSailArmada.vert
 * @brief attrA.xy = quad UV (0..1), attrA.w = quad ID (0..2999), attrB = seeds (GEOM_QUADS).
 *
 * Audio Reactivity (geometry; see the .frag header for the shading side):
 *   audioAdvance   -> orbital phase of the fleet (pre-integrated)
 *   audioSwell     -> base amplitude of the sails' tacking motion
 *   audioKick      -> sail size pulse
 *   audioSpread    -> FLEET DISPERSION: a narrow spectrum draws the armada
 *                     into a tight formation near the star, rich wide
 *                     harmonics scatter it out to the far orbits.  Applied to
 *                     a SEPARATE display radius, never to `r` itself -- `r`
 *                     feeds orbit_speed, which multiplies absolute `time`, and
 *                     changing it would remap the whole orbital phase at once
 *   audioBuildUp   -> TACKING HARDER: as an EDM build climbs toward its drop
 *                     the sails pitch further over on each swing, so the fleet
 *                     flashes edge-on more and more violently.  Amplitude only
 *                     -- the swing's time coefficient stays constant
 *   audioSharpness -> GLINT LOBE: dull material gives a broad soft solar
 *                     sheen on the foil, harsh bright material a hard narrow
 *                     star.  The gain is scaled inversely to the lobe width,
 *                     so widening cannot brighten the (un-tonemapped) frame
 */
in vec4 attrA; ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an
               ///< index).
in vec4 attrB; ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

uniform mat4  projM;          ///< Projection matrix.
uniform float eyeOff;         ///< Stereo eye offset (0 in mono).
uniform float time;           ///< Seconds since the program started (never reset; see sceneTime).
uniform float audioPhase;     ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                              ///< backwards).
uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioBass;      ///< Bass band level, 0..1.
uniform float audioMid;       ///< Mid band level, 0..1.
uniform float audioHigh;      ///< High band level, 0..1.
uniform float audioSwell;     ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioSpread;    ///< Spectral spread, 0..1.
uniform float audioBuildUp;   ///< Build-up toward a drop, 0..1.
uniform float audioSharpness; ///< Sharpness of the sound: 0 dull and dark .. 1 bright and harsh.

out vec3  vPos;    ///< Position (from the vertex stage).
out vec3  vNormal; ///< Surface normal (from the vertex stage).
out vec2  vUV;     ///< Texture coordinate 0..1 over the screen (from the vertex stage).
out float vQuadID; ///< Quad ID (from the vertex stage).
out float vGlint;  ///< Glint (from the vertex stage).

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2  corner_uv = attrA.xy;
    float quad_id = attrA.w;
    vec4  seed = attrB;

    // Orbital radius and spherical orbital mechanics.  `r` is FROZEN: it
    // feeds orbit_speed, which multiplies absolute `time`, so making it
    // audio-reactive would remap the whole accumulated orbital phase in one
    // frame (the project-wide anti-flicker rule).
    float r = 1.8 + seed.x * 3.5;
    float orbit_speed = 0.3 / sqrt( r );
    float phi = seed.y * 6.28318 + time * orbit_speed + audioAdvance * 0.1;
    float theta = ( seed.z - 0.5 ) * 2.2 + 0.3 * sin( time * 0.2 + seed.w * 6.28 );

    // FLEET DISPERSION rides on a separate DISPLAY radius instead, which
    // touches no integrated phase: a narrow spectrum draws the armada into a
    // tight formation, rich harmonics scatter it out to the far orbits.
    float r_disp = r * ( 0.84 + 0.36 * clamp( audioSpread, 0.0, 1.0 ) );

    // Quad center in 3D orbit
    vec3 center = vec3(
        r_disp * cos( phi ) * cos( theta ),
        r_disp * sin( theta ),
        r_disp * sin( phi ) * cos( theta ) );

    // Sail orientation vectors (tacking into the solar wind from origin)
    vec3 sail_normal = normalize( center );
    vec3 tangent_x = normalize( cross( sail_normal, vec3( 0.0, 1.0, 0.0 ) ) );
    vec3 tangent_y = cross( tangent_x, sail_normal );

    // Audio-reactive sail pitching & waving.  A rising EDM build makes the
    // fleet TACK HARDER -- the swing amplitude grows toward the drop, so the
    // sails flash edge-on more and more.  Amplitude only: the swing's time
    // coefficient stays a constant.
    float pitch_angle = ( 0.2 + 0.3 * audioSwell + 0.45 * clamp( audioBuildUp, 0.0, 1.0 ) )
                        * sin( time * 2.0 + seed.x * 10.0 );
    float cp = cos( pitch_angle ), sp = sin( pitch_angle );
    sail_normal = normalize( sail_normal * cp + tangent_y * sp );
    tangent_y = cross( tangent_x, sail_normal );

    // Sail size and local vertex extrusion
    float sail_size = ( 0.12 + 0.06 * seed.w ) * ( 1.0 + 0.3 * audioKick );
    vec2  local_offset = ( corner_uv - vec2( 0.5 ) ) * sail_size;
    vec3  pos = center + tangent_x * local_offset.x + tangent_y * local_offset.y;

    // Specular solar glint aligned with camera
    vec3 view_dir = normalize( vec3( 0.0, 0.0, 6.5 ) - center );
    vec3 light_dir = normalize( center ); // Light comes from central star at origin
    vec3 half_vec = normalize( light_dir + view_dir );
    // SHARPNESS sets the glint's lobe: dull material -> a broad soft sheen
    // over the foil, harsh bright material -> a hard narrow star.  This scene
    // has no tonemap in the .frag, so the gain is scaled DOWN as the lobe
    // widens; a broad glint must not integrate to a brighter frame.
    float shp = clamp( audioSharpness, 0.0, 1.0 );
    float glint = pow( max( dot( sail_normal, half_vec ), 0.0 ), mix( 12.0, 64.0, shp ) )
                  * ( 0.35 + 0.75 * shp );

    vPos = pos;
    vNormal = sail_normal;
    vUV = corner_uv;
    vQuadID = quad_id;
    vGlint = glint;

    // Stereoscopic 3D camera projection
    vec3 vp = pos;
    vp.z += 6.5;
    vp.x -= eyeOff;

    gl_Position = projM * vec4( vp.x, vp.y, -vp.z, 1.0 );
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
