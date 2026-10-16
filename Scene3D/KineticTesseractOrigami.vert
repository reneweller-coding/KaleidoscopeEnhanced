#version 330 core
/*****************************************************************************\
 *                              KineticTesseractOrigami.vert
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Vertex stage companion to KineticTesseractOrigami.frag -- see that file's header for this scene's description.
 *
 *  @author René Weller
 */
// attrA.xy = quad-local corner uv (0..1), attrA.w = quad id, attrB = seeds
// (Scene3DShader.cpp GEOM_QUADS)
in vec4 attrA; ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an
               ///< index).
in vec4 attrB; ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

uniform mat4  projM;        ///< Projection matrix.
uniform float eyeOff;       ///< Stereo eye offset (0 in mono).
uniform float time;         ///< Seconds since the program started (never reset; see sceneTime).
uniform float audioPhase;   ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance; ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                            ///< backwards).
uniform float audioKick;    ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioBass;    ///< Bass band level, 0..1.
uniform float audioMid;     ///< Mid band level, 0..1.
uniform float audioHigh;    ///< High band level, 0..1.
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).

out vec3  vPos;       ///< Position (from the vertex stage).
out vec2  vUV;        ///< Texture coordinate 0..1 over the screen (from the vertex stage).
out float vFoldAngle; ///< Fold angle (from the vertex stage).

/**  Pseudo-random number 0..1 from a float.
 *
 * @param p  The input value. (in)
 *
 * @return
 *   A pseudo-random number 0..1.
 **/
float hash11( float p )
{
    p = fract( p * 0.1031 );
    p *= p + 71.19;
    p *= p + p;
    return fract( p );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float quad_id = attrA.w;
    float seed = hash11( quad_id );

    // 50x60 Miura-ori origami facet grid
    float grid_x = mod( quad_id, 50.0 );
    float grid_y = floor( quad_id / 50.0 );

    vec2 grid_uv = ( vec2( grid_x, grid_y ) - vec2( 25.0, 30.0 ) ) / 25.0;

    // Folding angle gamma (0 = flat, pi/2 = fully folded compact)
    float t = time * 0.35 + audioAdvance * 0.2;
    float fold = ( 0.5 + 0.45 * sin( t * 0.7 + length( grid_uv ) * 2.0 ) ) * ( 1.0 - 0.3 * audioKick );

    // Miura-ori fold equations:
    float a = 0.12;      // Facet length
    float b = 0.12;      // Facet width
    float alpha = 1.047; // 60 degrees

    float v = asin( sin( alpha ) * sin( fold ) );
    float u = asin( cos( alpha ) / max( cos( v ), 0.001 ) );

    float x = ( grid_x - 25.0 ) * a * cos( v );
    float y = ( grid_y - 30.0 ) * b * cos( u );
    float z = ( ( mod( grid_x + grid_y, 2.0 ) == 0.0 ) ? 1.0 : -1.0 ) * a * sin( fold ) * ( 1.0 + audioBass * 0.5 );

    vec3 facet_center = vec3( x, y, z );

    // Local vertex of quad
    vec2 offset = attrA.xy - vec2( 0.5 );
    vec3 local_pos = vec3( offset.x * a * 0.95, offset.y * b * 0.95, 0.0 );
    vec3 pos = facet_center + local_pos;

    vPos = pos;
    vUV = attrA.xy;
    vFoldAngle = fold;

    // Stereoscopic 3D camera projection
    vec3 vp = pos;
    vp.z += 4.5;
    vp.x -= eyeOff;

    gl_Position = projM * vec4( vp.x, vp.y, -vp.z, 1.0 );
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
