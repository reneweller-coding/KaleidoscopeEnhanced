/**
 * @file SpoutOut.h
 * @brief Facade for sending the rendered frame out via Spout for other apps (e.g. OBS) to consume.
 */
// SpoutOut.h
// ---------------------------------------------------------------------------
// Minimal facade around the Spout2 SDK (ThirdParty/SpoutGL, BSD-2 licence):
// publishes the displayed frame as a Spout sender so OBS / Resolume / any
// Spout receiver can pick it up ("Kaleidoscope" sender, CLI flag -o).
//
// Deliberately a separate translation unit: the Spout sources load their own
// OpenGL extension pointers, which must never be mixed into the GLee-based
// translation units of the main app.  Only plain ints cross this interface.
// ---------------------------------------------------------------------------
#pragma once

/**
 * @brief Creates the Spout sender under the given name.
 *
 * Safe to call again once already initialized; it is then a no-op.
 * @param senderName The Spout sender name other applications will see and connect to (e.g. "Kaleidoscope").
 * @return true once a Spout sender object exists (construction itself has no failure path here).
 */
bool spoutOutInit( const char *senderName );

/**
 * @brief Publishes one GL texture as this frame's Spout output.
 *
 * Must be called with the app's GL context current (i.e. from paint()).
 * @param glTexture The GL_TEXTURE_2D id of the frame to publish; the call is skipped if 0.
 * @param width Width of glTexture in pixels; the call is skipped if 0.
 * @param height Height of glTexture in pixels; the call is skipped if 0.
 */
void spoutOutSend( unsigned int glTexture, unsigned int width, unsigned int height );

/**
 * @brief Releases the Spout sender.
 */
void spoutOutRelease();
