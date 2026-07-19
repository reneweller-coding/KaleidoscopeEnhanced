// SpoutIn.h
// ---------------------------------------------------------------------------
// Minimal facade around the Spout2 SDK (ThirdParty/SpoutGL, BSD-2 licence):
// RECEIVES a Spout sender's texture so it can replace the photo as the source
// image of the whole pipeline (CLI flag -i <sender|any>).  A webcam reaches
// the app the same way (e.g. OBS with its Spout output).
//
// Like SpoutOut this is deliberately a separate translation unit: the Spout
// sources load their own OpenGL extension pointers, which must never be mixed
// into the GLee-based translation units.  Only plain ints cross the interface.
// ---------------------------------------------------------------------------
#pragma once

bool spoutInInit( const char *senderName );   // "any"/"" = the active sender
// Call once per frame with the app's GL context current.  Returns the GL
// texture id holding the received frame (0 = no sender / size just changed);
// width/height receive the sender size.
unsigned int spoutInReceive( unsigned int *width, unsigned int *height );
void spoutInRelease();
