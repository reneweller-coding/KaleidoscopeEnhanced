#version 400 core
/**
 * @file AnechoicChamberWedges.tese
 * @brief Tessellation evaluation for AnechoicChamberWedges: the far wall
 * of an anechoic chamber -- a field of foam wedges (pyramids on a grid)
 * facing the camera, filling the frame.  The (u,v) patch plane is the
 * wall; each wedge rises toward the camera by a triangle-wave height so
 * the ridges are sharp.  Nothing moves: the wall is fixed.  The wedge
 * index and the height along the wedge go to the fragment stage, where
 * the bands light the tips.  No camera motion.
 */
/// Layout qualifiers of this stage (work-group size, or the primitive in or out).
layout( quads, fractional_odd_spacing, ccw ) in;

in vec2 tcUV[];   ///< UV (from the tessellation control stage).
in vec4 tcSeed[]; ///< Seed (from the tessellation control stage).

out vec3  vWorld;  ///< World position (from the vertex stage).
out vec2  vSurfUV; ///< Surf UV (from the vertex stage).
out vec3  vNormal; ///< Surface normal (from the vertex stage).
out float vWedge;  ///< Wedge (from the vertex stage).
out float vHeight; ///< Height (from the vertex stage).

uniform mat4  projM;                       ///< Projection matrix.
uniform float eyeOff;                      ///< Stereo eye offset (0 in mono).
const vec2    Extent = vec2( 24.0, 14.0 ); ///< Size of the tessellated ground patch (x, z in world units).

uniform float wedgeP; ///< Wedge knob, 0..1.

/**  Triangle wave 0..1..0 of period 1.
 *
 * @param x  The input. (in)
 *
 * @return
 *   The wave value.
 **/
float tri( float x )
{
    return 1.0 - abs( fract( x ) * 2.0 - 1.0 );
} // 0..1..0 triangle wave

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2  uv_a = mix( tcUV[0], tcUV[1], gl_TessCoord.x );
    vec2  uv_b = mix( tcUV[3], tcUV[2], gl_TessCoord.x );
    vec2  uv = mix( uv_a, uv_b, gl_TessCoord.y );
    float cols = 12.0 + 8.0 * clamp( wedgeP, 0.0, 1.0 );
    float rows = cols * Extent.y / Extent.x;
    vec2  g = vec2( uv.x * cols, uv.y * rows );
    // Wedge height: a pyramid in each cell (min of the two triangle waves).
    float hx = tri( g.x ), hy = tri( g.y );
    float h = min( hx, hy ) * 1.6;
    vec3  p = vec3( ( uv.x - 0.5 ) * Extent.x, ( uv.y - 0.5 ) * Extent.y, 11.0 - h );
    // Normal from the pyramid face: the gradient of min(tri, tri).
    vec2 cell_f = fract( g ) - 0.5;
    vec3 n;
    if ( abs( cell_f.x ) > abs( cell_f.y ) )
        n = normalize( vec3( sign( cell_f.x ) * 1.6 * cols / Extent.x * 2.0, 0.0, 1.0 ) );
    else
        n = normalize( vec3( 0.0, sign( cell_f.y ) * 1.6 * rows / Extent.y * 2.0, 1.0 ) );
    n.z = -n.z; // faces the camera (-z)
    vWorld = p;
    vSurfUV = uv;
    vNormal = n;
    vWedge = floor( g.x ) + floor( g.y ) * cols;
    vHeight = h / 1.6;
    vec3 vp = vec3( p.x - eyeOff, p.y, p.z );
    gl_Position = projM * vec4( vp.x, vp.y, -vp.z, 1.0 );
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
