#version 330 core
/*****************************************************************************\
 *                              ProfileStill.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  A still photo as a scene: the outgoing picture of the transition measurements.
 *
 *  `PresetEditor --transprofile --scene ProfileStill.frag` (Tools/transition_profile.py) sweeps every transition from
 *  this scene to the second photo.  The scene must stand still, or its own motion would be counted as the
 *  transition's, and it must be a PICTURE: until 10.11.2026 the measurements used Blit.frag here, which in the
 *  preview reads one texel, so the outgoing scene was a single flat colour and everything a transition does to the old
 *  picture (a slide, a fold, a pixelation) was invisible to the measurement.
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).

uniform vec2      resolution; ///< Size of the render target in pixels.
uniform sampler2D tex0;       ///< The current photo.

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    fragColor = vec4( texture( tex0, gl_FragCoord.xy / resolution ).rgb, 1.0 );
}
