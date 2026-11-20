#version 330 core
/*****************************************************************************\
 *                              StereoProbe2D.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  The stereo measuring picture for 2D scenes (20.11.2026): a white disc on the left and a mid-grey disc on the
 *  right, in the upper part of the frame (clear of StereoProbe3D's cards, so a fade between the two can be measured),
 *  on a dark grey ground.
 *
 *  A 2D scene has no geometry; the present pass gives it depth from the picture (Engine/Present.frag,
 *  stereoDepthAt(): brightness pops toward the viewer, the centre recedes).  Tools/stereo_disparity.py finds the two
 *  discs in each eye and measures how far apart they lie: the white one must lie in front of the grey one, whose
 *  depth comes from its place alone (0.3 * 1.5 * its distance from the centre; it is too dark for the bloom).  Not
 *  part of any preset.
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).

uniform vec2 resolution; ///< Size of the render target in pixels.

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2  p = gl_FragCoord.xy / resolution.y;          // height units
    float aspect = resolution.x / resolution.y;
    float white = 1.0 - smoothstep( 0.095, 0.1, distance( p, vec2( 0.3 * aspect, 0.8 ) ) );
    float grey = 1.0 - smoothstep( 0.095, 0.1, distance( p, vec2( 0.7 * aspect, 0.8 ) ) );
    vec3  c = vec3( 0.08 ) + vec3( 0.92 ) * white + vec3( 0.42 ) * grey;
    fragColor = vec4( c, 1.0 );
}
