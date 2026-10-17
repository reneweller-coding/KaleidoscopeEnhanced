#version 330 core
/*****************************************************************************\
 *                              GlitchMatrixHypercube.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  GLITCH MATRIX HYPERCUBE: 4D Tesseract projection intersecting 3D/2D space, combined with cybernetic data
 *  moshing, digital glitch slices, ASCII/Matrix data streams, chromatic aberration, and multi-planar photo texture
 *  projection.
 *
 *    audioAdvance -> drives 4D hyper-rotations across XY/XW/YW planes
 *    audioKick    -> triggers temporal buffer slice glitches & matrix flash
 *    audioSpectrum-> modulates 4D hyper-facet tessellation depth
 *    audioHigh    -> excites high-frequency digital noise & green glyph rain
 *
 *  Per-activation variety:
 *    glitchP   float digital glitch slice intensity    (0.4..2.0)
 *    rotSpdP   float 4D hyper-rotation speed           (0.5..1.8)
 *    facetP    float hypercube wireframe thickness     (0.5..2.2)
 *    hueP      float color spectrum offset             (0..6.28)
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).

uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since this activation, plus a rolled start (see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioPhase;     ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                              ///< backwards).
uniform float audioSwell;     ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;     ///< Overall loudness, 0..1.
uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioCentroid;  ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioSubBass;   ///< Sub-bass band level, 0..1.
uniform float audioBass;      ///< Bass band level, 0..1.
uniform float audioMid;       ///< Mid band level, 0..1.
uniform float audioHigh;      ///< High band level, 0..1.
uniform float audioFlux;      ///< Spectral flux (how fast the spectrum changes), 0..1.
uniform float audioBeatPhase; ///< Position within the current beat, 0..1.

uniform float glitchP;        ///< Glitch knob: digital glitch slice intensity, 0.4..2.
uniform float rotSpdP;        ///< Rot spd knob: 4D hyper-rotation speed, 0.5..1.8.
uniform float facetP;         ///< Facet knob: hypercube wireframe thickness, 0.5..2.2.
uniform float hueP;           ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

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


/**  IMG-PALETTE (house standard): colours come from a rotating arc in the CURRENT slideshow image, so every
 * activation inherits a fresh palette from the photos; the arc follows the musical key (audioChromaHue is circular-
 * slewed = jump-free) with a slow advance drift, valence shapes saturation.
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
    vec3  pc = img( clamp( vec2( 0.5 ) + rad * vec2( cos( ang ), sin( ang ) ), 0.0, 1.0 ) );
    float pg = dot( pc, vec3( 0.333 ) );
    return mix( vec3( pg ), pc, 0.55 + 0.45 * audioValence );
}

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

/**  Pseudo-random number 0..1 from a 2D point.
 *
 * @param p  The point. (in)
 *
 * @return
 *   A pseudo-random number 0..1.
 **/
float hash21( vec2 p )
{
    p = fract( p * vec2( 123.34, 456.21 ) );
    p += dot( p, p + 45.32 );
    return fract( p.x * p.y );
}

/**  4D Rotation matrices
 *
 * @param p  The 4-vector. (in)
 * @param a  The angle in radians. (in)
 *
 * @return
 *   The rotated 4-vector.
 **/
vec4 rotXW( vec4 p, float a )
{
    float c = cos( a ), s = sin( a );
    return vec4( p.x * c - p.w * s, p.y, p.z, p.x * s + p.w * c );
}

/**  Rotation in the yw plane.
 *
 * @param p  The 4-vector. (in)
 * @param a  The angle in radians. (in)
 *
 * @return
 *   The rotated 4-vector.
 **/
vec4 rotYW( vec4 p, float a )
{
    float c = cos( a ), s = sin( a );
    return vec4( p.x, p.y * c - p.w * s, p.z, p.y * s + p.w * c );
}

/**  Rotation in the zw plane.
 *
 * @param p  The 4-vector. (in)
 * @param a  The angle in radians. (in)
 *
 * @return
 *   The rotated 4-vector.
 **/
vec4 rotZW( vec4 p, float a )
{
    float c = cos( a ), s = sin( a );
    return vec4( p.x, p.y, p.z * c - p.w * s, p.z * s + p.w * c );
}

/**  Rotation in the xy plane.
 *
 * @param p  The 4-vector. (in)
 * @param a  The angle in radians. (in)
 *
 * @return
 *   The rotated 4-vector.
 **/
vec4 rotXY( vec4 p, float a )
{
    float c = cos( a ), s = sin( a );
    return vec4( p.x * c - p.y * s, p.x * s + p.y * c, p.z, p.w );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float glt = ( glitchP > 0.0 ) ? glitchP : 1.0;
    float spd = ( rotSpdP > 0.0 ) ? rotSpdP : 1.0;
    float fct = ( facetP > 0.0 ) ? facetP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 st = gl_FragCoord.xy / resolution;
    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;

    // Audio-reactive glitch slicing
    float glitch_time = floor( time * 4.00 );
    float slice_seed = hash21( vec2( floor( st.y * 24.0 ), glitch_time ) );
    float slice_active = step( 0.85 - 0.25 * audioKick, slice_seed ) * glt;

    vec2 glitched_uv = uv;
    vec2 glitched_st = st;
    if ( slice_active > 0.5 )
    {
        float x_shift = ( hash21( vec2( slice_seed, 1.2 ) ) - 0.5 ) * 0.12 * ( 1.0 + audioKick * 1.5 );
        glitched_uv.x += x_shift;
        glitched_st.x += x_shift;
    }

    // 4D Tesseract ray-geometry projection
    float t = time * 0.4 * spd + audioAdvance * 0.2;
    vec3  col = vec3( 0.01, 0.02, 0.03 ); // Dark cyber background

    // Matrix glyph stream in background
    vec2  matrix_uv = vec2( floor( glitched_st.x * 60.0 ) / 60.0, glitched_st.y );
    float stream_spd = 2.5 + hash21( vec2( matrix_uv.x, 9.0 ) ) * 4.0;
    float stream_y = fract( matrix_uv.y + time * stream_spd * 0.2 );
    float glyph_rand = hash21( vec2( matrix_uv.x, floor( glitched_st.y * 35.0 - time * stream_spd * 7.0 ) ) );
    float char_mask = step( 0.4, glyph_rand ) * pow( 1.0 - stream_y, 3.0 );
    vec3  matrix_glyph = vec3( 0.1, 1.0, 0.4 ) * char_mask * ( 0.4 + audioHigh * 0.8 );
    col += matrix_glyph;

    // 16 Vertices of a 4D Unit Hypercube: (±1, ±1, ±1, ±1)
    // Project edges onto 2D screen
    vec3  wire_color = vec3( 0.0 );
    float min_wire_dist = 100.0;

    // Hypercube rotation angles
    float a_xw = t * 0.7;
    float a_yw = t * 0.5 + audioPhase * 0.3;
    float a_zw = t * 0.9;
    float a_xy = t * 0.3;

    // Camera 4D perspective distance
    float cam_dist_4d = 2.8 + 0.5 * sin( t * 0.2 ) - audioSwell * 0.4;

    // Raymarch through 4D bounding hyper-planes
    for ( int i = 0; i < 16; ++i )
    {
        // Vertex in 4D space
        vec4 v4 = vec4(
            ( float( i & 1 ) - 0.5 ) * 2.0,
            ( float( ( i >> 1 ) & 1 ) - 0.5 ) * 2.0,
            ( float( ( i >> 2 ) & 1 ) - 0.5 ) * 2.0,
            ( float( ( i >> 3 ) & 1 ) - 0.5 ) * 2.0 );

        // Apply 4D rotations
        v4 = rotXW( v4, a_xw );
        v4 = rotYW( v4, a_yw );
        v4 = rotZW( v4, a_zw );
        v4 = rotXY( v4, a_xy );

        // 4D to 3D perspective projection: P3 = V.xyz / (cam_dist_4d - V.w)
        float w_factor = 1.0 / max( cam_dist_4d - v4.w, 0.2 );
        vec3  p3 = v4.xyz * w_factor;

        // 3D to 2D projection
        vec2 p2 = p3.xy * ( 1.2 / ( p3.z + 2.5 ) );

        // Connect edges: each vertex connects to 4 neighbors (bit flip in 1 dimension)
        for ( int b = 0; b < 4; ++b )
        {
            int j = i ^ ( 1 << b );
            if ( j > i )
            {
                vec4 v4_b = vec4(
                    ( float( j & 1 ) - 0.5 ) * 2.0,
                    ( float( ( j >> 1 ) & 1 ) - 0.5 ) * 2.0,
                    ( float( ( j >> 2 ) & 1 ) - 0.5 ) * 2.0,
                    ( float( ( j >> 3 ) & 1 ) - 0.5 ) * 2.0 );
                v4_b = rotXW( v4_b, a_xw );
                v4_b = rotYW( v4_b, a_yw );
                v4_b = rotZW( v4_b, a_zw );
                v4_b = rotXY( v4_b, a_xy );

                float w_factor_b = 1.0 / max( cam_dist_4d - v4_b.w, 0.2 );
                vec3  p3_b = v4_b.xyz * w_factor_b;
                vec2  p2_b = p3_b.xy * ( 1.2 / ( p3_b.z + 2.5 ) );

                // 2D Line segment distance from glitched_uv to line(p2, p2_b)
                vec2  pa = glitched_uv - p2;
                vec2  ba = p2_b - p2;
                float h = clamp( dot( pa, ba ) / max( dot( ba, ba ), 1e-5 ), 0.0, 1.0 );
                float line_dist = length( pa - ba * h );

                // Laser wireframe glow
                float edge_glow = ( 0.002 * fct ) / ( line_dist * line_dist + 0.0001 );

                // Color by 4D depth (v4.w)
                vec3 edge_col = imgPalette( 0.30 * ( ( v4.w + v4_b.w ) * 0.25 + 0.5 ) ) * 1.5;
                wire_color += edge_col * edge_glow;
            }
        }
    }

    col += wire_color * ( 0.7 + audioKick * 0.8 );

    // Multi-planar photo mapping with RGB chromatic aberration
    float chrom_off = ( 0.015 + 0.02 * audioKick ) * glt;
    vec3  photo_r = img( clamp( glitched_st + vec2( chrom_off, 0.0 ), 0.0, 1.0 ) );
    vec3  photo_g = img( clamp( glitched_st, 0.0, 1.0 ) );
    vec3  photo_b = img( clamp( glitched_st - vec2( chrom_off, 0.0 ), 0.0, 1.0 ) );
    vec3  photo_aberrated = vec3( photo_r.r, photo_g.g, photo_b.b );

    // Blend photo onto hypercube core
    float core_dist = length( glitched_uv );
    float core_mask = smoothstep( 1.2, 0.2, core_dist ) * ( 0.35 + 0.35 * audioLevel );
    col = mix( col, col + photo_aberrated * 1.4, core_mask );

    // Scanlines
    float scanline = sin( gl_FragCoord.y * 1.5 + time * 5.0 ) * 0.06;
    col -= scanline;

    if ( hue > 0.001 )
        col = hueRot( col, hue );

    // Catalogue review: soft-knee exposure — hot audio compresses
    // instead of clipping the whole frame to white.
    vec3 cat_tone = ( col ) * 0.65;
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( cat_tone, 1.0 );
}
