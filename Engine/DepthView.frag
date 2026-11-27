#version 330 core
/*****************************************************************************\
 *                              DepthView.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  KALEIDO_SHOW_DEPTH=1 (26.11.2026, plan T2): a scene's depth buffer as a grey picture, written over the scene's
 *  colour before the combine stage -- what the depth effects, the 2.5D parallax and the stereo will read.
 *
 *  White is near, black is far.  A 2D scene that passes the photo's depth on (`// @depth`) shows the photo's depth
 *  itself, 0..1, recovered from the window depths the host gave it (photoDepthWin); a 3D scene its linearised
 *  distance on a log scale up to 60 units; a scene without depth, and the far plane, black.  Only for looking at
 *  depth (contact sheets) and for Tools/chain_regress.py: the runner and the uber shader must write the same depth.
 *
 *  @author René Weller
 */
out vec4          fragColor;     ///< The pixel's colour (output).
uniform sampler2D texDepth;      ///< The scene's depth buffer (window depth, 0..1).
uniform vec2      photoDepthWin; ///< Window depth of the photo's near end (x, depth 1) and far end (y, depth 0).
uniform vec2      nearFar;       ///< Near and far clip distances.
uniform int       depthKind;     ///< 0: no depth, 1: the photo's depth (a 2D scene marked for depth), 2: a 3D scene's.

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float z = texelFetch( texDepth, ivec2( gl_FragCoord.xy ), 0 ).r;
    float g = 0.0;
    if ( z < 1.0 && depthKind == 1 )
        g = clamp( ( z - photoDepthWin.y ) / ( photoDepthWin.x - photoDepthWin.y ), 0.0, 1.0 );
    else if ( z < 1.0 && depthKind == 2 )
    {
        float n = nearFar.x, f = nearFar.y;
        float lin = ( 2.0 * n * f ) / ( f + n - ( z * 2.0 - 1.0 ) * ( f - n ) );
        g = 1.0 - clamp( log( lin / n ) / log( 60.0 / n ), 0.0, 1.0 );
    }
    fragColor = vec4( vec3( g ), 1.0 );
}
