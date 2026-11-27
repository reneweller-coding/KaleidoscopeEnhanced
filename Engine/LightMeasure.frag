#version 330 core
/*****************************************************************************\
 *                              LightMeasure.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  The frame as the photosensitivity limiter measures it when the intermediates are 16 bit (KALEIDO_HDR_BUFFERS).
 *
 *  Engine/SafetyLimit.comp reads mips of the frame and takes their luminance, times the exposure, as what the viewer
 *  sees.  At 8 bit every pixel was at most 1 before the mips averaged it; at 16 bit a mip averages light above 1,
 *  which the present pass rolls off instead of showing it as more brightness -- read as it is, a dense field of
 *  lights tripped the flash hazard where the screen did not flash.  But that light does reach the screen in another
 *  way: as glow, the bloom of its bright pass, which grows with it and pulses with the beat.  So the limiter's frame
 *  is each pixel at most 1 -- what an 8-bit target holds -- plus the glow the light above 1 adds beyond what the
 *  8-bit frame gave (the bright pass of Engine/BloomBlur.frag, weighted as Present.frag adds bloom and streaks back).
 *  A frame without light above 1 is measured exactly as an 8-bit one.  Written to an RGBA16F target with mipmaps.
 *
 *  At a quarter of the frame's size since 27.11.2026: each texel is the mean of its 4 x 4 pixels, each measured as
 *  above -- what the second mip level of a frame-sized target held, and the limiter reads only levels far above it.
 *  The frame-sized target cost 0.08 ms a frame (drawing it and its mipmaps at 2880 x 1620) and 50 MB.
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).

uniform sampler2D tex;        ///< The input picture (the present pass's 16-bit source).
uniform float     glowWeight; ///< How much of the bright pass Present.frag adds back as glow this frame.
uniform int       cellSize;   ///< Pixels of the frame per texel along each side (4; 1: pixel by pixel).

/**  One pixel of the frame as the limiter counts it: at most 1, plus the glow its light above 1 adds.
 *
 * @param p  The pixel. (in)
 *
 * @return
 *   The measured colour.
 **/
vec3 measured( ivec2 p )
{
    vec3 c = texelFetch( tex, p, 0 ).rgb;
    c = mix( min( c, vec3( 64.0 ) ), vec3( 0.0 ), isnan( c ) );
    vec3 base = clamp( c, 0.0, 1.0 );
    vec3 extra = ( max( c - 0.7, 0.0 ) - max( base - 0.7, 0.0 ) ) * 1.6;
    return base + glowWeight * extra;
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    ivec2 p0 = ivec2( gl_FragCoord.xy ) * cellSize;
    vec3  sum = vec3( 0.0 );
    for ( int y = 0; y < cellSize; ++y )
        for ( int x = 0; x < cellSize; ++x )
            sum += measured( p0 + ivec2( x, y ) );
    fragColor = vec4( sum / float( cellSize * cellSize ), 1.0 );
}
