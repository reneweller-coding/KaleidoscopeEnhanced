//---------------------------------------------------------------------------
//                              SpoutIn
//---------------------------------------------------------------------------
//  Copyright (C): 2026 reneweller, MIT License (see LICENSE)
//---------------------------------------------------------------------------
/*! @file
 *
 *  @brief
 *  Facade for receiving a texture from another application via the Spout GPU texture-sharing protocol, for use as
 *  an image source.
 *
 *  Minimal facade around the Spout2 SDK (ThirdParty/SpoutGL, BSD-2 licence):
 *  RECEIVES a Spout sender's texture so it can replace the photo as the source
 *  image of the whole pipeline (CLI flag -i <sender|any>).  A webcam reaches
 *  the app the same way (e.g. OBS with its Spout output).
 *
 *  Like SpoutOut this is deliberately a separate translation unit: the Spout
 *  sources load their own OpenGL extension pointers, which must never be mixed
 *  into the GLee-based translation units.  Only plain ints cross the interface.
 *
 *  @author René Weller
 */

#pragma once

/**  Creates the Spout receiver, optionally pinned to one sender name.
 *
 * @param senderName  The Spout sender to bind to, or "any"/"" to receive from the currently active sender. (in)
 *
 * @return
 *   true once a Spout receiver object exists (construction itself has no failure path here).
 *
 * Safe to call again once already initialized; it is then a no-op.
 *
 * @sideeffects
 *   Changes s_rx.
 **/
bool spoutInInit( const char *senderName ); // "any"/"" = the active sender

/**  Polls the bound sender for a new frame into an internally-owned GL texture.
 *
 * @param width   Receives the sender's current width in pixels (only written when a nonzero texture id is
 *                returned). (out)
 * @param height  Receives the sender's current height in pixels (only written when a nonzero texture id is
 *                returned). (out)
 *
 * @return
 *   The GL texture id holding the latest received frame, or 0 if there is no active sender, or the sender just
 *   (re)connected/resized (the texture becomes valid again from the next frame on).
 *
 * Call once per frame with the app's GL context current.  Returns the GL
 * texture id holding the received frame (0 = no sender / size just changed);
 * width/height receive the sender size.
 **/
unsigned int spoutInReceive( unsigned int *width, unsigned int *height );

/**  Releases the Spout receiver and deletes the internally-owned GL texture.
 *
 * @sideeffects
 *   Changes s_h, s_rx, s_tex, s_w.
 **/
void spoutInRelease();
