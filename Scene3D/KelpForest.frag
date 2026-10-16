#version 330 core
/*****************************************************************************\
 *                              KelpForest.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Shades one kelp-blade ribbon of an underwater forest: a soft translucent body with a brighter midrib line down
 *  the centre.
 *
 *  All colour and motion (the surge sway, tip taper, caustic tinting, and
 *  audio response) are computed upstream in KelpForest.vert and arrive
 *  baked into vCol; this stage only shapes the cross-blade falloff from
 *  vSide into a body-plus-midrib glow.
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).
// KelpForest.frag — soft blade: bright midrib, translucent edges.
in vec4  vCol;  ///< Colour (from the vertex stage).
in float vSide; ///< Which side of a strip (from the vertex stage).

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float d = abs( vSide );
    float body = exp( -d * d * 2.2 );
    float rib = exp( -d * d * 30.0 ) * 0.5;
    fragColor = vec4( vCol.rgb * ( body + rib ), 1.0 );
}
