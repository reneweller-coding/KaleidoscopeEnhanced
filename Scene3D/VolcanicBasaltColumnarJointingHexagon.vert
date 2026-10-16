#version 330 core
/**
 * @file VolcanicBasaltColumnarJointingHexagon.vert
 * @brief Vertex stage companion to VolcanicBasaltColumnarJointingHexagon.frag -- see that file's
 * header for this scene's description.
 *
 * The 4900 cubes used to be spent on a 12 x 12 patch stacked 34 deep along the
 * view axis: a terrace barely 2.6 units across, sitting as a small clump in the
 * middle of a black frame, with 97 % of the prisms hidden behind each other.
 * They are now one 70 x 70 causeway (4900 = 70 x 70 exactly) laid out so that
 * it covers the WHOLE picture: the rows step away from the camera in a
 * geometric progression and the column pitch grows with the row's depth, which
 * is what keeps the prisms the same size on screen from the front edge to the
 * far terrace.
 */

in vec4 attrA; ///< xyz = cube corner (-0.5..0.5), w = cube index
in vec4 attrB; ///< 4 seeds in [0,1)

out vec3  vNormal;     ///< Surface normal (from the vertex stage).
out vec3  vCol;        ///< Colour (from the vertex stage).
out float vBasaltGlow; ///< Basalt glow (from the vertex stage).
out float vFog;        ///< Fog (from the vertex stage).

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

uniform float columnPitchP;  ///< Column pitch knob, 0.1..0.4.
uniform float columnHeightP; ///< Column height knob, 0.4..1.8.

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

/**  House tint: bend a colour toward the photo palette while keeping its luminance.
 *
 * @param c  The colour. (in)
 * @param t  Position on the palette, 0..1. (in)
 * @param k  Strength of the tint, 0..1. (in)
 *
 * @return
 *   The tinted colour.
 *
 * The raw palette was used directly before, so a dark corner of the slideshow image handed the whole causeway
 * near-black stone.
 **/
vec3 palTint( vec3 c, float t, float k )
{
    vec3 tp = imgPalette( t );
    tp *= dot( c, vec3( 0.3333 ) ) / max( dot( tp, vec3( 0.3333 ) ), 1e-3 );
    return mix( c, tp, k );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec3  corner = attrA.xyz;
    float c_index = attrA.w;

    float t = time * 0.35 + audioAdvance * 0.3;

    // Columnar basalt formation (Giant's Causeway / Fingal's Cave)
    // Hexagonal stepped columns of cooling basalt lava.
    const float n_side = 70.0; // 70 x 70 = the 4900 cubes
    float       ix = mod( c_index, n_side );
    float       iy = floor( c_index / n_side );

    // ---- ROWS: geometric depth steps ---------------------------------
    // The scene is viewed from steeply above (the 0.55 tilt below), so the
    // terrace plane covers the frame from the bottom edge (world y ~ -2.3)
    // past the top (~ +4.4).  A 4.25x growth over the 70 rows is what makes
    // the ON-SCREEN row spacing come out even end to end.
    const float y_near = -2.35, y_far = 4.45, g_row = 4.25;
    float       row_u = ( iy + 0.5 ) / n_side;
    float       yy = y_near + ( y_far - y_near ) * ( pow( g_row, row_u ) - 1.0 ) / ( g_row - 1.0 );
    float       dy_row = ( y_far - y_near ) * log( g_row ) * pow( g_row, row_u )
                         / ( ( g_row - 1.0 ) * n_side );

    // ---- COLUMNS: pitch grows with the row's depth --------------------
    // columnPitchP now sets the joint pitch RELATIVE to that depth ramp, so
    // a fine causeway and a coarse one both still reach past both edges.
    float depth_s = ( 0.522 * yy + 4.5 ) / 4.5;
    float pitch = ( 0.155 + 0.11 * ( columnPitchP > 0.01 ? columnPitchP : 0.22 ) )
                  * pow( depth_s, 0.7 );

    // Hexagonal stagger
    float hex_offset = mod( iy, 2.0 ) < 0.5 ? 0.0 : 0.5;
    float xx = ( ix - n_side * 0.5 + 0.5 + hex_offset ) * pitch;
    vec2  p_grid = vec2( xx, yy );

    // Stepped fracture column heights.  +z runs down-and-away under the tilt,
    // so a column's TOP is at -h and its shaft runs back down into the flow.
    float r = length( p_grid );
    float h_max = ( columnHeightP > 0.01 ? columnHeightP : 0.8 );
    float undul = 0.5 + 0.35 * sin( p_grid.x * 2.2 + p_grid.y * 1.7 + t * 0.5 )
                  + 0.15 * sin( p_grid.x * 5.3 - p_grid.y * 4.1 - t * 0.31 );
    float h = h_max * clamp( undul, 0.0, 1.0 );

    vec3 center_pos = vec3( p_grid.x, p_grid.y, 0.45 - h * 0.5 );

    // Geothermal magma glow pulse in basalt joint cracks
    float crack_glow = exp( -abs( fract( h * 2.0 - t * 1.5 ) - 0.5 ) * 16.0 )
                       * ( 1.0 + 3.0 * audioKick );
    vBasaltGlow = crack_glow;

    // SWELL thickens the prism cross-section; the shaft length follows the
    // column's own step height so the terrace never opens gaps.
    float widen = 0.86 + 0.10 * audioSwell;
    vec3  world_pos = center_pos + corner * vec3( pitch * widen, dy_row * widen * 1.06, h + 0.9 );
    vNormal = normalize( corner );

    vec3 basalt = vec3( 0.30, 0.315, 0.375 ) * ( 0.8 + 0.45 * fract( attrB.x + iy * 0.017 ) );
    vCol = palTint( basalt, fract( r * 0.2 + row_u * 0.3 + audioCentroid ), 0.30 );
    vFog = clamp( ( yy - 0.4 ) / 4.6, 0.0, 1.0 );

    // Camera Transform (V3)
    vec3 vp = world_pos;

    // 3D rotation
    float tilt = 0.55;
    float c = cos( tilt ), s = sin( tilt );
    vp = vec3( vp.x, vp.y * c - vp.z * s, vp.y * s + vp.z * c );
    vp.z += 4.5;
    vp.x -= eyeOff;

    gl_Position = projM * vec4( vp.x, vp.y, -vp.z, 1.0 );
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
