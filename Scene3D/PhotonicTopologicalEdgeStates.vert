#version 330 core
/**
 * @file PhotonicTopologicalEdgeStates.vert
 * @brief Vertex stage companion to PhotonicTopologicalEdgeStates.frag -- see that file's
 * header for this scene's description.
 */

in vec4 attrA; ///< x = t in [0,1], y = side (-1/+1), z = 0, w = ribbon index
in vec4 attrB; ///< 4 hash seeds in [0,1)

out vec2  vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
out float vSide; ///< Which side of a strip (from the vertex stage).
out float vRibbonID;
out vec3  vCol; ///< Colour (from the vertex stage).
out float vPulse;

uniform mat4  projM;  ///< Projection matrix.
uniform float eyeOff; ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).

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

uniform float ribbonWidthP;
uniform float edgeSpeedP;

/// @brief The photo at a coordinate: the cross-fade of tex0 and tex1.
vec3 img( vec2 uv )
{
    return ( interpolation * texture( tex0, uv ) + ( 1.0 - interpolation ) * texture( tex1, uv ) ).rgb;
}

/// @brief The house palette: a colour of the photo on an arc that turns with the music's hue.
vec3 imgPalette( float t )
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin( audioAdvance * 0.013 );
    vec3  col = img( clamp( vec2( 0.5 ) + rad * vec2( cos( ang ), sin( ang ) ), 0.0, 1.0 ) );
    float g = dot( col, vec3( 0.333 ) );
    return mix( vec3( g ), col, 0.55 + 0.45 * audioValence );
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float t_coord = attrA.x;
    float side = attrA.y;
    float r_index = attrA.w;

    vSide = side;
    vRibbonID = r_index;
    vUV = vec2( t_coord, side * 0.5 + 0.5 );

    float t = time * 0.4 + audioAdvance * 0.35;

    // THE topological-insulator picture: a honeycomb array of waveguide
    // cells (dim lattice) with light racing around the array's EDGE (the
    // chiral edge state).  The old wobbly circles recorded as noodles.
    bool is_edge = ( r_index >= 18.0 );

    // Hexagon path: piecewise-linear loop through 6 corners.
    float hex_t = fract( t_coord ) * 6.0;
    float hk = floor( hex_t );
    float hf = fract( hex_t );
    float a0 = ( hk + 0.0 ) * 1.04719755 + 0.5235988;
    float a1 = ( hk + 1.0 ) * 1.04719755 + 0.5235988;
    float hex_r = is_edge ? 1.62 : 0.44;
    vec2  c0 = vec2( cos( a0 ), sin( a0 ) ) * hex_r;
    vec2  c1 = vec2( cos( a1 ), sin( a1 ) ) * hex_r;
    vec2  hex_p = mix( c0, c1, hf );

    // Cell centres: one central cell plus a ring of six.
    float cell_idx = mod( r_index, 7.0 );
    vec2  cell_c = ( cell_idx < 0.5 ) ? vec2( 0.0 )
                                      : vec2( cos( ( cell_idx - 1.0 ) * 1.04719755 ),
                                              sin( ( cell_idx - 1.0 ) * 1.04719755 ) )
                                            * 0.80;
    if ( is_edge )
        cell_c = vec2( 0.0 );

    vec3 center_pos = vec3( hex_p + cell_c, 0.0 );
    // The whole array breathes and tilts gently in z.
    center_pos.z = 0.22 * sin( center_pos.x * 1.7 + t * 0.5 )
                   + 0.10 * sin( r_index + t * 0.3 );

    vec3 tangent = normalize( vec3( c1 - c0, 0.001 ) );
    vec3 normal = normalize( cross( tangent, vec3( 0.0, 0.0, 1.0 ) ) );

    float width = ( ribbonWidthP > 0.001 ? ribbonWidthP : 0.045 )
                  * ( is_edge ? 2.6 : 1.0 ) * ( 1.0 + 0.3 * audioSwell );
    vec3  world_pos = center_pos + normal * ( side * width );

    // The chiral pulse: on the edge loop it RACES (one direction only --
    // that is the topology); in the bulk cells it only breathes faintly.
    float pulse_speed = ( edgeSpeedP > 0.01 ? edgeSpeedP : 1.5 );
    float pulse_phase = fract( t_coord * 2.0 - t * ( is_edge ? pulse_speed : 0.0 ) + r_index * 0.37 );
    vPulse = exp( -abs( pulse_phase - 0.5 ) * 16.0 )
             * ( is_edge ? ( 1.6 + 3.0 * audioKick ) : ( 0.25 + 0.4 * audioSwell ) );

    // Bulk cells stay glassy-dim; the edge channel carries the colour.
    vCol = is_edge ? imgPalette( fract( 0.08 + t_coord * 0.5 ) ) * 1.5
                   : imgPalette( fract( 0.55 + r_index * 0.04 ) ) * 0.45;

    // Engine Camera Transformation (V3)
    vec3 vp = world_pos;
    // Tilt FIRST, about the lattice's own centre: the old order tilted the
    // already-dollied scene about the camera origin, which shifted the whole
    // structure DOWN by dolly*sin(tilt) (~1 unit) -- the reported "black at
    // the top" with the lattice cropped at the bottom edge.
    float tilt = 0.35;
    float c = cos( tilt ), s = sin( tilt );
    vp = vec3( vp.x, vp.y * c - vp.z * s, vp.y * s + vp.z * c );
    vp.z += 3.5;
    vp.x -= eyeOff;

    gl_Position = projM * vec4( vp.x, vp.y, -vp.z, 1.0 );
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
