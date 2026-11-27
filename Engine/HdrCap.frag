#version 330 core
/*****************************************************************************\
 *                              HdrCap.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  The light cap of a scene marked `// @hdrcap <X>` (27.11.2026, docs/engine-internals-70-defaults.md): drawn over
 *  the scene's finished 16-bit frame with the blend equation GL_MIN, so every pixel keeps min( its colour, X ).
 *
 *  Additive particle scenes sum hundreds of sprites on one pixel; an 8-bit target held each sum at 1, a 16-bit one
 *  holds 20 or 50, and the glow of that turned a few scenes into a white card.  The scene cannot cap its own sum (the
 *  blending happens after its fragment stage), so the host does it once, after the scene (and its MSAA resolve).
 *  Only with 16-bit intermediates: an 8-bit frame is never touched.  The alpha is far above any value, so the
 *  scene's alpha stays as it is.
 *
 *  @author René Weller
 */
out vec4      fragColor; ///< The pixel's colour (output): the cap, blended with GL_MIN.
uniform float capLight;  ///< The scene's cap (the number of its `// @hdrcap` line).

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    fragColor = vec4( vec3( capLight ), 65000.0 );
}
