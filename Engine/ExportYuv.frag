#version 330 core
/*****************************************************************************\
 *                              ExportYuv.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  The video export's colour conversion: the finished frame into NV12 (BT.709, limited range, 4:2:0), the layout
 *  the hardware encoders take natively -- 1.5 bytes per pixel cross the bus instead of 4, and ffmpeg converts
 *  nothing.
 *
 *  The target is ONE single-channel image of width x 1.5*height, laid out exactly as the bytes leave glReadPixels:
 *  rows 0 .. height-1 hold the luma plane, the rows above it the chroma plane (U at even columns, V at odd ones, one
 *  pair per 2x2 block of pixels). Row 0 is the TOP line of the picture, so the readback needs no flip.
 *
 *  Before the store quantises to 8 bits, triangular (TPDF) dither of one code value is added: the engine renders in
 *  float, and the typical dark gradient -- a glow on black -- otherwise bands into visible rings. The noise comes
 *  from the pcg3d hash (Jarzynski and Olano, "Hash Functions for GPU Rendering", JCGT 2020), seeded per frame so it
 *  does not stand still.
 *
 *  @author René Weller
 */
uniform sampler2D src;    ///< The finished frame (bottom-up, GL convention), or the motion-blur sum of sub-frames.
uniform float     scale;  ///< Weight of src: 1, or 1/n for a sum of n sub-frames.
uniform float     gain;   ///< Fade: 0 = black, 1 = the full picture.
uniform ivec2     size;   ///< Video width and height in pixels (both even).
uniform uint      seed;   ///< Frame number: moves the dither from frame to frame.
uniform float     dither; ///< Dither amplitude in code values (1 = TPDF of one code value, 0 = none).

out vec4 fragColor; ///< The byte's code value / 255 in .r (the target has one channel) (output).

const vec3 KY = vec3( 0.2126, 0.7152, 0.0722 ); ///< BT.709 luma weights of R', G', B'.

/**  The picture at a texel: weighted, faded, clamped to the displayable range.
 *
 * @param p  Texel position in src. (in)
 *
 * @return
 *   R'G'B' in 0..1.
 **/
vec3 rgbAt( ivec2 p )
{
    return clamp( texelFetch( src, p, 0 ).rgb * scale * gain, 0.0, 1.0 );
}

/**  pcg3d: three well-mixed 32-bit values from three inputs.
 *
 * @param v  Pixel position and frame. (in)
 *
 * @return
 *   The hashed vector.
 **/
uvec3 pcg3d( uvec3 v )
{
    v = v * 1664525u + 1013904223u;
    v.x += v.y * v.z;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    v ^= v >> 16u;
    v.x += v.y * v.z;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    return v;
}

/**  A code value with TPDF dither, as the 0..1 the store expects.
 *
 * @param code  The exact code value (16..235 luma, 16..240 chroma). (in)
 *
 * @return
 *   (code + noise) / 255, where the noise is the difference of two uniform numbers (-1..1, triangular).
 **/
float dithered( float code )
{
    uvec3 h = pcg3d( uvec3( uvec2( gl_FragCoord.xy ), seed ) );
    float n = float( h.x >> 8u ) * ( 1.0 / 16777216.0 ) - float( h.y >> 8u ) * ( 1.0 / 16777216.0 );
    return clamp( ( code + dither * n ) / 255.0, 0.0, 1.0 );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    ivec2 o = ivec2( gl_FragCoord.xy );
    if ( o.y < size.y )
    {
        // luma: video line o.y is texel row size.y-1-o.y
        vec3 c = rgbAt( ivec2( o.x, size.y - 1 - o.y ) );
        fragColor = vec4( dithered( 16.0 + 219.0 * dot( c, KY ) ) );
        return;
    }
    // chroma: one U,V pair per 2x2 block; video lines 2r and 2r+1 are texel rows size.y-1-2r and size.y-2-2r
    int   r = o.y - size.y;
    int   x = ( o.x >> 1 ) << 1;
    int   y = size.y - 2 - 2 * r;
    vec3  c = 0.25
              * ( rgbAt( ivec2( x, y ) ) + rgbAt( ivec2( x + 1, y ) ) + rgbAt( ivec2( x, y + 1 ) )
                  + rgbAt( ivec2( x + 1, y + 1 ) ) );
    float luma = dot( c, KY );
    float ch = ( ( o.x & 1 ) == 0 ) ? ( c.b - luma ) / 1.8556 : ( c.r - luma ) / 1.5748;
    fragColor = vec4( dithered( 128.0 + 224.0 * ch ) );
}
