#version 330 core
/*****************************************************************************\
 *                              Chladni3DAcousticLevitation.vert
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Vertex stage companion to Chladni3DAcousticLevitation.frag -- see that file's header for this scene's
 *  description.
 *
 *  @author René Weller
 */

in vec4 attrA; ///< xyz = cube corner (-0.5..0.5), w = cube index
in vec4 attrB; ///< 4 seeds in [0,1)

out vec3  vNormal;       ///< Surface normal (from the vertex stage).
out vec3  vCol;          ///< Colour (from the vertex stage).
out float vAcousticNode; ///< Acoustic node (from the vertex stage).
out vec3  vLocalPos;     ///< Object-space position (from the vertex stage).

uniform mat4  projM;      ///< Projection matrix.
uniform float eyeOff;     ///< Stereo eye offset (0 in mono).
uniform float time;       ///< Seconds since this activation, plus a rolled start (see sceneTime).
uniform vec2  resolution; ///< Size of the render target in pixels.

uniform float audioPhase;     ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                              ///< backwards).
uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSwell;     ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioCentroid;  ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float nodeDensityP;  ///< Node density knob, 2..5.
uniform float particleSizeP; ///< Particle size knob, 0.03..0.1.

/**  The photo at a coordinate: the cross-fade of tex0 and tex1.
 *
 * @param uv  Coordinate in the photo, 0..1. (in)
 *
 * @return
 *   The cross-faded photo colour (RGB).
 **/
vec3 img( vec2 uv )
{
    return ( interpolation * texture( tex0, uv ) + ( 1.0 - interpolation ) * texture( tex1, uv ) ).rgb;
}

/**  Smooth Gor'kov clustering: a monotone warp of one axis that pulls particles toward the pressure NODES of cos(k*x +
 * ph) (the zeros at pi/2 + n*pi) and away from the antinodes.
 *
 * @param x   The coordinate. (in)
 * @param k   Wave number. (in)
 * @param ph  Phase. (in)
 * @param a   Strength (below 0.5). (in)
 *
 * @return
 *   The warped coordinate.
 *
 * Deliberately NOT a snap-to-nearest-node -- a snap makes a particle jump a whole node spacing the instant the drifting
 * phase crosses a cell boundary.  a < 0.5 keeps the map invertible, so particles never cross each other.
 **/
float gorkovClump( float x, float k, float ph, float a )
{
    return x + a * sin( 2.0 * ( k * x + ph ) ) / k;
}

/**  The house palette: a colour of the photo on an arc that turns with the music's hue.
 *
 * @param t  Position on the palette arc, 0..1 for one turn. (in)
 *
 * @return
 *   The palette colour (RGB).
 **/
vec3 imgPalette( float t )
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin( audioAdvance * 0.013 );
    vec3  col = img( clamp( vec2( 0.5 ) + rad * vec2( cos( ang ), sin( ang ) ), 0.0, 1.0 ) );
    float g = dot( col, vec3( 0.333 ) );
    return mix( vec3( g ), col, 0.55 + 0.45 * audioValence );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec3  corner = attrA.xyz;
    float c_index = attrA.w;
    vLocalPos = corner;

    float t = time * 0.35 + audioAdvance * 0.3;

    // 3D acoustic standing wave pressure field in ultrasonic levitation chamber
    // P(x,y,z) = cos(nx*x)*cos(ny*y)*cos(nz*z)
    float k_nodes = ( nodeDensityP > 0.01 ? nodeDensityP : 3.0 );

    // ---- the levitation CHAMBER, sized to the view frustum ---------------
    // The old build hung every particle on one small sphere in the middle of
    // the picture.  A multi-emitter array traps particles throughout its whole
    // working volume, so the seeds are now spread in FRUSTUM coordinates
    // (x,y scaled by each particle's own depth): the trap field then covers
    // the frame evenly at every distance instead of clustering centrally.
    const float TanY = 0.5206; // 55 deg vertical FOV
    float       aspect = ( resolution.y > 0.5 ) ? resolution.x / resolution.y : 1.7778;

    float p_seed = c_index / 4900.0;
    float h1 = attrB.x, h2 = attrB.y, h3 = attrB.z, h4 = attrB.w;

    float dz = 3.4 + h3 * 6.0; // chamber depth 3.4 .. 9.4
    float half_h = dz * TanY;
    float half_w = half_h * aspect;

    // 2.6 rather than 2.0: the chamber still reaches past all four edges when
    // the preset camera rig yaws/rolls, and the surplus keeps the on-screen
    // particle count (and therefore the exposure) in a sane band.
    vec3 base_p = vec3( ( h1 - 0.5 ) * 2.6 * half_w,
                        ( h2 - 0.5 ) * 2.6 * half_h,
                        0.0 );
    // slow chamber-wide drift so the trap field is never frozen
    base_p.x += 0.35 * sin( t * 0.31 + p_seed * 41.0 );
    base_p.y += 0.30 * cos( t * 0.27 + p_seed * 57.0 );

    // Acoustic Gor'kov radiation force gathers the particles onto the nodal
    // surfaces of the standing wave; the trap phases creep, so the whole
    // lattice breathes and the clusters migrate from node to node.
    float ph_x = t * 0.50, ph_y = -t * 0.40, ph_z = t * 0.30;
    base_p.x = gorkovClump( base_p.x, k_nodes, ph_x, 0.42 );
    base_p.y = gorkovClump( base_p.y, k_nodes, ph_y, 0.42 );
    float z_local = gorkovClump( ( h4 - 0.5 ) * 1.6, k_nodes, ph_z, 0.42 );

    float gorkov_x = cos( base_p.x * k_nodes + ph_x );
    float gorkov_y = cos( base_p.y * k_nodes + ph_y );
    float gorkov_z = cos( z_local * k_nodes + ph_z );
    float pressure_node = gorkov_x * gorkov_y * gorkov_z;
    vAcousticNode = pressure_node;

    // Acoustic levitation trapped cluster position (still jittering in its trap)
    vec3 trap_pos = vec3( base_p.xy, z_local ) + vec3( gorkov_x, gorkov_y, gorkov_z ) * 0.12;

    // Microparticle cube size -- proportional to depth, so a far cluster is
    // still the same handful of pixels as a near one and no part of the
    // chamber thins out into invisible specks.
    float p_size = clamp( ( particleSizeP > 0.001 ? particleSizeP : 0.055 ), 0.03, 0.07 );
    float sz = p_size * ( dz / 5.5 ) * ( 1.0 + 0.3 * audioSwell );
    vec3  cube_pos = trap_pos + corner * sz;

    vNormal = normalize( corner );
    vCol = imgPalette( fract( p_seed * 7.0 + pressure_node * 0.3 + audioCentroid ) );

    // Camera Transform (V3)
    vec3 vp = cube_pos;

    // Gentle chamber parallax (a full spin would swing the wide trap volume
    // out of the frustum and empty the picture again).
    float a = 0.16 * sin( t * 0.20 );
    float c = cos( a ), s = sin( a );
    vp = vec3( vp.x * c - vp.z * s, vp.y, vp.x * s + vp.z * c );
    vp.z += dz;
    vp.z = max( vp.z, 0.9 );
    vp.x -= eyeOff;

    gl_Position = projM * vec4( vp.x, vp.y, -vp.z, 1.0 );
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
