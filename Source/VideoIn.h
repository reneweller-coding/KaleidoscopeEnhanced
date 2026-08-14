#ifndef VIDEOIN_H
#define VIDEOIN_H

// Native video as an image source.
// -----------------------------------------------------------------------
// Slots into exactly the same place as the Spout input: it hands the renderer
// a GL texture id, and FilterShader puts that in m_liveTex, where it replaces
// both photo slots.  Every effect that samples tex0/tex1 then works on moving
// footage without knowing anything changed.
//
// Decoding is Qt6Multimedia's, which means the platform's own codecs — no
// bundled decoder, and whatever the machine can already play works here.
// -----------------------------------------------------------------------

// Start playing 'path'.  A directory plays every video in it in turn; a single
// file loops.  Idempotent: calling it again with the same path does nothing.
// Returns false if the path holds nothing playable.
bool videoInInit( const char *path );

// The newest decoded frame as a GL texture, or 0 if none has arrived yet.
// Uploads only when a new frame actually appeared, so calling this every frame
// costs nothing while the video sits between frames.
unsigned int videoInFrame( unsigned int *width, unsigned int *height );

void videoInRelease();

#endif
