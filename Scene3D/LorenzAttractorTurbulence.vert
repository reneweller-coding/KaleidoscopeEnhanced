#version 330 core
/*****************************************************************************\
 *                              LorenzAttractorTurbulence.vert
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  attrA.x = t (0..1 along ribbon), attrA.y = side (-1..+1 across ribbon), attrA.w = ribbon ID (0..19), attrB =
 *  seeds (Scene3DShader.cpp GEOM_RIBBON).
 *
 *  @author René Weller
 */
in vec4 attrA; ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an
               ///< index).
in vec4 attrB; ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

uniform mat4  projM;        ///< Projection matrix.
uniform float eyeOff;       ///< Stereo eye offset (0 in mono).
uniform float time;         ///< Seconds since this activation, plus a rolled start (see sceneTime).
uniform float audioPhase;   ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance; ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                            ///< backwards).
uniform float audioKick;    ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioBass;    ///< Bass band level, 0..1.
uniform float audioMid;     ///< Mid band level, 0..1.
uniform float audioHigh;    ///< High band level, 0..1.
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).

out vec3  vPos;      ///< Position (from the vertex stage).
out float vT;        ///< T (from the vertex stage).
out float vRibbonID; ///< Ribbon ID (from the vertex stage).
out float vVelocity; ///< Velocity (from the vertex stage).
out float vSide;     ///< Which side of a strip (from the vertex stage).

/**  Integrated strange attractor parametric path
 *
 * @param s          Position along the ribbon. (in)
 * @param ribbonIdx  Index of the ribbon. (in)
 * @param seed       Seed. (in)
 *
 * @return
 *   The point.
 **/
vec3 evalAttractor( float s, float ribbonIdx, float seed )
{
    float t_param = s * 14.0 + time * 0.4 + audioAdvance * 0.2 + ribbonIdx * 0.35;

    // Non-linear combination of Lorenz & Aizawa attractor harmonic equations
    float sigma = 10.0 + 2.0 * sin( audioAdvance * 0.1 );
    float rho = 28.0 + 6.0 * audioBass;
    float beta = 8.0 / 3.0;

    float p1 = sin( t_param * 0.8 ) * 1.8;
    float p2 = cos( t_param * 0.6 ) * 1.8;
    float p3 = sin( t_param * 1.4 + seed * 6.28 ) * 1.2;

    // Strange attractor ribbon vortex coordinates
    float x = sin( t_param ) * ( 2.2 + 0.8 * cos( t_param * 0.5 + ribbonIdx ) ) + p1 * 0.4;
    float y = cos( t_param * 0.8 ) * ( 1.8 + 0.6 * sin( t_param * 0.3 ) ) + p3 * 0.5;
    float z = sin( t_param * 1.2 + ribbonIdx * 0.8 ) * 2.0 + p2 * 0.6;

    // Swirl around Z axis
    float ang = t_param * 0.2;
    float ca = cos( ang ), sa = sin( ang );
    return vec3( x * ca - y * sa, x * sa + y * ca, z );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float t = attrA.x;
    float side = attrA.y;
    float ribbon_id = attrA.w;
    float seed = attrB.x;

    // Evaluate point and tangent
    float dt = 0.01;
    vec3  p_a = evalAttractor( t - dt, ribbon_id, seed );
    vec3  p_b = evalAttractor( t + dt, ribbon_id, seed );
    vec3  p = evalAttractor( t, ribbon_id, seed );

    vec3  dir = normalize( p_b - p_a );
    float speed = length( p_b - p_a ) / ( 2.0 * dt );

    // Compute ribbon side vector perpendicular to tangent and camera
    vec3 up_ref = vec3( 0.0, 1.0, 0.0 );
    if ( abs( dot( dir, up_ref ) ) > 0.95 )
        up_ref = vec3( 1.0, 0.0, 0.0 );
    vec3 side_vec = normalize( cross( dir, up_ref ) );

    // Dynamic ribbon width (thicker on beats and high velocity)
    float width = ( 0.05 + 0.04 * audioKick + 0.03 * sin( t * 20.0 - time * 6.0 ) ) * ( 0.8 + 0.4 * audioSwell );
    vec3  pos = p + side_vec * ( side * width );

    vPos = pos;
    vT = t;
    vRibbonID = ribbon_id;
    vVelocity = speed;
    vSide = side;

    // Stereoscopic 3D camera projection
    vec3 vp = pos;
    vp.z += 6.5;
    vp.x -= eyeOff;

    gl_Position = projM * vec4( vp.x, vp.y, -vp.z, 1.0 );
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
