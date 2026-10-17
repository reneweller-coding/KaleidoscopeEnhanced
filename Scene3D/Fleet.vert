#version 330 core
/*****************************************************************************\
 *                              Fleet.vert
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  One loaded craft, drawn as a whole fleet under way.
 *
 *  geom="mesh" with instances="N" on the scene entry: the same buffer is drawn N times and this stage places each
 *  copy from gl_InstanceID -- in squadrons of five or six, each in its own formation (wedge, echelon, line abreast,
 *  column or loose), spacing, size class and speed, on nearly one course past the camera's shoulder into the depth.
 *  The craft lie in their own frame from Engine/model_orient.tsv (Tools/model_orient.py): nose +Z, up +Y.
 *
 *  The sky shell is in the SAME buffer as the mesh, so it would be drawn N times
 *  on top of itself. Instance 0 keeps it; every other instance collapses it to a
 *  degenerate point. That costs nothing and needs no second draw call.
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
uniform int   meshInstances;    ///< Number of mesh instances.
uniform vec3  meshExtent;       ///< Half size of the scene's mesh bounding box.
uniform vec3  meshCenter;       ///< Centre of the scene's mesh bounding box.
uniform mat3  meshOrient;       ///< Rotation into the craft frame (nose +Z, up +Y), Engine/model_orient.tsv.
uniform vec3  meshOrientExtent; ///< Half-extents in the craft frame, without the generator's needles.
uniform vec3  meshOrientCenter; ///< Centre in the craft frame.

uniform float audioAdvance; ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                            ///< backwards).
uniform float audioKick;    ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioDrop;    ///< Drop envelope: high after a detected drop, decaying.

uniform float sizeP;   ///< Size knob, 0..1.
uniform float formP;   ///< 0 = wedge, 1 = column, 2 = sphere shell
uniform float spreadP; ///< formation spacing
uniform float hueP;    ///< Hue knob (radians, rolled per activation): here also which side the course drifts to.

out vec2  vUV;     ///< Texture coordinate 0..1 over the screen (from the vertex stage).
out vec3  vNormal; ///< Surface normal (from the vertex stage).
out vec3  vPos;    ///< Position (from the vertex stage).
out float vBg;     ///< Background flag (from the vertex stage).
out float vRank;   ///< 0 at a squadron's leader, 1 at its last craft.
out float vAft;    ///< How much a face looks toward the stern (the craft's own -Z), -1..1.
out float vStern;  ///< Where along the hull: 1 at the stern end, -1 at the nose.

/**  Pseudo-random number 0..1 from a float.
 *
 * @param n  The input value. (in)
 *
 * @return
 *   A pseudo-random number 0..1.
 **/
float hash11( float n )
{
    return fract( sin( n * 12.9898 ) * 43758.5453 );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    bool is_bg = gl_VertexID >= meshVertexCount;
    int  inst = gl_InstanceID;
    int  N = max( meshInstances, 1 );

    if ( is_bg )
    {
        // One backdrop, not N. Collapse the shell on every instance but the
        // first: the vertices land on the same clip-space point, the triangle
        // has zero area and nothing is rasterised.
        if ( inst > 0 )
        {
            gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 );
            vUV = vec2( 0.0 );
            vNormal = vec3( 0.0, 1.0, 0.0 );
            vPos = vec3( 0.0 );
            vBg = 1.0;
            vRank = 0.0;
            vAft = 0.0;
            vStern = 0.0;
            return;
        }
        vec3 w = attrA.xyz;
        vNormal = normalize( attrB.xyz );
        vPos = w;
        vUV = vec2( 0.0 );
        vBg = 1.0;
        vRank = 0.0;
        vAft = 0.0;
        vStern = 0.0;
        vec3 vp = vec3( w.x - eyeOff, w.y, w.z );
        gl_Position = projM * vec4( vp.x, vp.y, -vp.z, 1.0 );
        gl_Position.z = gl_Position.w * 0.999999;
        return;
    }

    float sz = ( sizeP > 0.01 ? sizeP : 1.0 );
    float spr = ( spreadP > 0.01 ? spreadP : 1.0 );
    float fi = float( inst );

    // ---- the armada (17.10.2026) ---------------------------------------------------------------------------------
    // The formation flew head-on at the camera as one lattice -- a wedge, a column or a shell -- every craft at the
    // same distance and nearly the same speed; seen from the front, as a flat band or an even cloud.  A fleet under way
    // is squadrons: groups of five or six in their own formation, at their own spacing, size class and speed, on
    // nearly the same heading, spread wide and deep.  It now passes the camera's shoulder and heads into the distance,
    // three-quarters from behind (the engines toward us), toward one vanishing point: near squadrons sweep past, far
    // ones creep, and the depth reads.
    float craft = 7.0 * sz; // one craft's length (p spans +-0.5 after `fit`); small against the depth of 220
    float G = clamp( floor( float( N ) / 5.5 + 0.5 ), 4.0, 14.0 );
    float g = mod( fi, G );    // the squadron
    float k = floor( fi / G ); // the place in it; 0 = the leader
    float n_g = ceil( ( float( N ) - g ) / G );
    float hg = hash11( g * 7.31 + 1.7 );
    float hg2 = hash11( g * 3.97 + 4.1 );
    float hg3 = hash11( g * 5.53 + 8.9 );
    float hg4 = hash11( g * 9.11 + 2.3 );

    // Heading: the fleet's course recedes and drifts to one side (chosen per activation), each squadron a degree or
    // two off it.
    float side = ( hueP > 3.14159 ) ? -1.0 : 1.0;
    vec3  course = normalize( vec3( 0.30 * side, 0.05, 1.0 ) );
    float yaw_g = ( hg3 - 0.5 ) * 0.07, pit_g = ( hg4 - 0.5 ) * 0.08;
    vec3  f = normalize( course + vec3( yaw_g, pit_g, 0.0 ) );
    vec3  r = normalize( cross( vec3( 0.0, 1.0, 0.0 ), f ) );
    vec3  u = cross( f, r );

    // Where the squadron's track runs: to either side of the camera (at least 1.6 craft, so no hull crosses the lens;
    // the clearance below does the rest) and above or below it.
    float lat = ( hash11( g * 2.17 + 0.3 ) < 0.5 ? -1.0 : 1.0 ) * ( 1.6 + 5.0 * hg ) * craft * spr;
    float alt = ( hg2 - 0.5 ) * 10.0 * craft * spr;

    // The squadron's formation and spacing.
    float sp = craft * ( 1.7 + 1.0 * hg4 ) * spr;
    int   form = int( hash11( g * 6.71 + 3.3 ) * 5.0 );
    if ( ( form == 1 || form == 2 ) && n_g > 4.5 )
        form = 0; // a long line of identical craft at even spacing reads as a chart: lines only for small groups
    vec3  slot;   // x across, y up, z along the course (negative = behind the leader), in spacings
    float side_k = ( mod( k, 2.0 ) < 0.5 ? 1.0 : -1.0 ) * ceil( k * 0.5 );
    if ( form == 0 ) // wedge: the leader at the apex
        slot = vec3( side_k * 0.9, 0.0, -abs( side_k ) * 0.8 );
    else if ( form == 1 ) // echelon: a diagonal line
        slot = vec3( k * 0.85 * ( hg > 0.5 ? 1.0 : -1.0 ), -k * 0.08, -k * 0.6 );
    else if ( form == 2 ) // line abreast
        slot = vec3( ( k - 0.5 * ( n_g - 1.0 ) ) * 1.15, 0.0, -abs( side_k ) * 0.1 );
    else if ( form == 3 ) // column, staggered
        slot = vec3( ( mod( k, 2.0 ) - 0.5 ) * 0.5, 0.0, -k * 1.25 );
    else // loose: scattered round the leader
        slot = ( vec3( hash11( fi * 4.31 ), hash11( fi * 6.17 ), hash11( fi * 8.29 ) ) - 0.5 ) * vec3( 3.2, 1.2, 3.2 )
               * sqrt( n_g ) * step( 0.5, k );
    // No two craft hold their slot exactly, and each keeps station with a slow drift of its own.
    slot += ( vec3( hash11( fi * 1.37 ), hash11( fi * 2.91 ), hash11( fi * 4.73 ) ) - 0.5 ) * vec3( 0.55, 0.45, 0.6 );
    float ph = fi * 2.399963;
    slot += vec3( sin( time * 0.07 + ph ), 0.5 * sin( time * 0.05 + ph * 1.3 ), sin( time * 0.09 + ph * 0.7 ) ) * 0.06;

    // Along the course: each squadron at its own speed (0.82 .. 1.18) and place in the stream.  Every craft wraps on
    // its own, behind the camera at -25 and, fogged out, at 205 -- just short of the far plane at 220 -- so a squadron
    // keeps its formation through the wrap and the stream never ends.
    const float Lo = -25.0, Span = 230.0;
    float       v_g = 4.6 * ( 0.82 + 0.36 * hash11( g * 4.43 + 6.1 ) );
    // The squadrons start spread along the whole stream (evenly, each a little off its share), so the sky is never
    // empty while some bunch up near the camera.
    float s = time * v_g + Span * ( g + 0.6 * hash11( g * 8.17 + 0.9 ) ) / G + slot.z * sp;
    s = Lo + mod( s - Lo, Span );
    vec3 centre = f * s + r * ( lat + slot.x * sp ) + u * ( alt + slot.y * sp );

    // Size: a class per squadron, the leader a size up.
    float scale = craft * ( 0.8 + 0.4 * hash11( g * 1.91 + 5.5 ) )
                  * ( k < 0.5 ? 1.35 : 0.9 + 0.2 * hash11( fi * 3.3 ) );

    // ---- the craft itself ----------------------------------------------------------------------------------------
    // In its own frame (Engine/model_orient.tsv): nose +Z, up +Y, centred, sized without the generator's needles.
    vec3  p = meshOrient * attrA.xyz - meshOrientCenter;
    vec3  nrm0 = meshOrient * attrB.xyz;
    vec3  e = meshOrientExtent;
    float fit = 0.5 / max( max( e.x, e.y ), e.z );

    // A slight bank of its own, held: craft on a straight run keep their attitude.
    float bank = ( hash11( fi * 5.9 ) - 0.5 ) * 0.10;
    float cb = cos( bank ), sb = sin( bank );
    mat3  roll = mat3( cb, sb, 0.0, -sb, cb, 0.0, 0.0, 0.0, 1.0 );
    mat3  att = mat3( r, u, f ) * roll; // model x, y, z -> across, up, along the course

    // Camera clearance, per craft (the whole hull moves as one): a centre inside the bubble is pushed onto it.
    float r_safe = scale * 1.6 + 6.0;
    float d_c = length( centre );
    if ( d_c < r_safe )
        centre *= r_safe / max( d_c, 1e-3 );
    vec3 world = att * ( p * ( scale * fit ) ) + centre;

    vUV = vec2( attrA.w, attrB.w );
    vNormal = normalize( att * nrm0 ); // world space: the light is a world direction
    vAft = -nrm0.z;                    // > 0 on the faces toward the stern
    vStern = -p.z / max( e.z, 1e-3 );  // 1 at the stern end of the hull, -1 at the nose
    vPos = world;
    vBg = 0.0;
    vRank = k / max( n_g - 1.0, 1.0 );

    vec3 vp = vec3( world.x - eyeOff, world.y, world.z );
    gl_Position = projM * vec4( vp.x, vp.y, -vp.z, 1.0 );
}
