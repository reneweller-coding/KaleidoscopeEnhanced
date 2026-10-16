#version 330 core
/*****************************************************************************\
 *                              CrystalShatterBurst.geom
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Geometry stage companion to CrystalShatterBurst.frag -- see that file's header for this scene's description.
 *
 *  Audio Reactivity:
 *    audioKick     -> explosive outward shard flight + gold tint
 *    audioSubBass  -> extra low-end shove on the fracture
 *    audioAdvance  -> shard tumble phase (pre-integrated, jump-free)
 *    audioSwell    -> camera pushes in
 *    audioSnare    -> snares/claps crack a SECOND subset of shards loose and
 *                     jolt their tumble
 *    audioBuildUp  -> rising EDM tension clenches the geode shut before the drop
 *
 *  @author René Weller
 */
/// CrystalShatterBurst.geom — Geometry Shader intercepts triangles and violently
/// fractures them into floating tetrahedral crystal shards along explosion vectors on beats.
layout( triangles ) in;
/// Layout qualifiers of this stage (work-group size, or the primitive in or out).
layout( triangle_strip, max_vertices = 3 ) out;

in vec3  vObjPos[];    ///< Obj pos (from the vertex stage).
in vec4  vSeeds[];     ///< Seeds (from the vertex stage).
in float vCubeIndex[]; ///< Cube index (from the vertex stage).

out vec3 gNormal; ///< Normal (from the geometry stage).
out vec3 gWorld;  ///< World (from the geometry stage).
out vec4 gCol;    ///< The colour gathered so far for this pixel.
out vec3 gBary;   ///< Bary (from the geometry stage).

uniform mat4  projM;  ///< Projection matrix.
uniform float eyeOff; ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).

uniform float audioAdvance; ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                            ///< backwards).
uniform float audioKick;    ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSubBass; ///< Sub-bass band level, 0..1.
uniform float audioHigh;    ///< High band level, 0..1.
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioSnare;   ///< snare / clap onset envelope
uniform float audioBuildUp; ///< EDM tension rising toward the drop

uniform float burstP;   ///< Burst knob, 0.5..2.2.
uniform float spinP;    ///< Spin knob, 0..1.
uniform float camDistP; ///< Camera distance knob, 0..1.
uniform float hueP;     ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

/**  Rotates a colour's hue by an angle (about the grey axis).
 *
 * @param c  The colour. (in)
 * @param a  The angle in radians. (in)
 *
 * @return
 *   The colour with its hue turned.
 **/
vec3 hueRot( vec3 c, float a )
{
    vec3  k = vec3( 0.57735026919 );
    float cs = cos( a ), sn = sin( a );
    return c * cs + cross( k, c ) * sn + k * dot( k, c ) * ( 1.0 - cs );
}

/**  Rotation of a vector about an axis (Rodrigues).
 *
 * @param v     The vector. (in)
 * @param axis  The axis (unit length). (in)
 * @param a     The angle in radians. (in)
 *
 * @return
 *   The rotated vector.
 **/
vec3 rotAxis( vec3 v, vec3 axis, float a )
{
    float c = cos( a ), s = sin( a );
    return v * c + cross( axis, v ) * s + axis * dot( axis, v ) * ( 1.0 - c );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float i = vCubeIndex[0];
    vec4  seeds = vSeeds[0];

    float brst = ( burstP > 0.0 ) ? burstP : 1.0;
    float spn = ( spinP > 0.0 ) ? spinP : 1.0;
    float c_dst = ( camDistP > 0.0 ) ? camDistP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    // Cube grid position in 3D space: 70x70 field arranged into a giant monolithic gemstone
    float gx = mod( i, 70.0 ) - 34.5;
    float gz = floor( i / 70.0 ) - 34.5;

    // Cluster cubes into a spherical/ellipsoid geometric geode
    float r = sqrt( gx * gx + gz * gz );
    if ( r > 32.0 )
        return;

    float geode_y = sin( r * 0.12 ) * 6.0 + ( seeds.y - 0.5 ) * 3.0;
    vec3  cube_center = vec3( gx * 0.45, geode_y, gz * 0.45 );

    // Explosive fracture outward displacement on audioKick.  Snares/claps
    // crack a DIFFERENT subset of shards loose (seeds.z decides which drum a
    // shard answers to), so the gem fractures in two interleaved rhythms.
    vec3  explode_dir = normalize( cube_center + vec3( 0.0, 1.0, 0.0 ) );
    float snare_crack = clamp( audioSnare, 0.0, 1.0 ) * step( 0.5, seeds.z );
    float shard_flight = ( audioKick * 6.0 + audioSubBass * 2.5 + snare_crack * 3.5 )
                         * brst * ( 0.5 + 0.5 * seeds.x );

    // An EDM build-up hauls the whole geode back in on itself — the gem
    // clenches shut under the rising tension, then blows apart at the drop.
    shard_flight *= 1.0 - 0.38 * clamp( audioBuildUp, 0.0, 1.0 );

    // Shard tumbling rotation (rate stays audio-free; the snare only adds a
    // decaying ANGLE jolt, so the tumble kicks and settles without flicker).
    vec3  spin_axis = normalize( seeds.yzw - 0.5 );
    float spin_angle = ( time * 3.0 + audioAdvance * 4.0 ) * spn * seeds.x
                       + snare_crack * 0.9;

    // Center of this triangle face
    vec3 face_center = ( vObjPos[0] + vObjPos[1] + vObjPos[2] ) / 3.0;

    // Shard world position
    vec3 shard_center = cube_center + explode_dir * shard_flight;

    // Camera
    float cam_angle = time * 0.15 + audioAdvance * 0.04;
    float cam_dist = ( 22.0 * c_dst ) - audioSwell * 4.0;
    vec3  cam_pos = vec3( sin( cam_angle ) * cam_dist, 10.0 + 3.0 * sin( time * 0.18 ), cos( cam_angle ) * cam_dist );
    vec3  look_target = vec3( 0.0, 0.0, 0.0 );

    vec3 ww = normalize( look_target - cam_pos );
    vec3 uu = normalize( cross( ww, vec3( 0.0, 1.0, 0.0 ) ) );
    vec3 vv = cross( uu, ww );

    // Facet normal calculation
    vec3 e1 = vObjPos[1] - vObjPos[0];
    vec3 e2 = vObjPos[2] - vObjPos[0];
    vec3 raw_normal = normalize( cross( e1, e2 ) );
    vec3 rot_norm = rotAxis( raw_normal, spin_axis, spin_angle );

    // Facet gem color: Ruby, Sapphire, Emerald, Diamond
    vec3 gem_col = mix( vec3( 0.1, 0.7, 1.0 ), vec3( 1.0, 0.1, 0.5 ), seeds.x );
    gem_col = mix( gem_col, vec3( 1.0, 0.85, 0.2 ), audioKick * 0.8 );
    if ( hue > 0.001 )
        gem_col = hueRot( gem_col, hue );

    vec3 bary_coords[3] = vec3[3]( vec3( 1.0, 0.0, 0.0 ), vec3( 0.0, 1.0, 0.0 ), vec3( 0.0, 0.0, 1.0 ) );

    // Emit the 3 corners of the shard
    for ( int k = 0; k < 3; ++k )
    {
        vec3 corner_rel = vObjPos[k] - face_center;
        vec3 rot_corner = rotAxis( corner_rel, spin_axis, spin_angle );
        vec3 world_p = shard_center + rotAxis( face_center, spin_axis, spin_angle ) + rot_corner;

        vec3 rel_p = world_p - cam_pos;
        vec3 view_p = vec3( dot( rel_p, uu ), dot( rel_p, vv ), dot( rel_p, ww ) );
        view_p.x -= eyeOff;

        gl_Position = projM * vec4( view_p.x, view_p.y, -view_p.z, 1.0 );
        gl_Position.x += eyeOff * 0.045 * gl_Position.w;

        gNormal = rot_norm;
        gWorld = world_p;
        gCol = vec4( gem_col, 1.0 );
        gBary = bary_coords[k];
        EmitVertex();
    }
    EndPrimitive();
}
