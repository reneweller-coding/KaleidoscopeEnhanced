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

bool spoutOutInit( const char *senderName );
void spoutOutSend( unsigned int glTexture, unsigned int width, unsigned int height );
void spoutOutRelease();
