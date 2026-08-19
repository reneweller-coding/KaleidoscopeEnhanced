/**
 * @file VideoIn.h
 * @brief Webcam/capture-device (and local video file/folder) input as an image source, via Qt6Multimedia.
 */
#ifndef VIDEOIN_H
#define VIDEOIN_H

// Native video as an image source.
// -----------------------------------------------------------------------
// Slots into exactly the same place as the Spout input: it hands the renderer
// a GL texture id, and RenderPipeline puts that in m_liveTex, where it replaces
// both photo slots.  Every effect that samples tex0/tex1 then works on moving
// footage without knowing anything changed.
//
// Decoding is Qt6Multimedia's, which means the platform's own codecs — no
// bundled decoder, and whatever the machine can already play works here.
// -----------------------------------------------------------------------

/**
 * @brief Starts (or, for an already-open path, is a no-op for) playback of a video file or folder.
 *
 * Start playing 'path'.  A directory plays every video in it in turn; a single
 * file loops.  Idempotent: calling it again with the same path does nothing.
 * Returns false if the path holds nothing playable.
 * @param path A single video file, or a directory containing one or more video files.
 * @return true if playback was started (or was already running on this exact path); false if nothing playable was found at path.
 */
bool videoInInit( const char *path );

/**
 * @brief The newest decoded video frame as a GL texture, uploading it lazily on first access after it arrives.
 *
 * The newest decoded frame as a GL texture, or 0 if none has arrived yet.
 * Uploads only when a new frame actually appeared, so calling this every frame
 * costs nothing while the video sits between frames.
 * @param width Receives the frame width in pixels (only written once a texture exists).
 * @param height Receives the frame height in pixels (only written once a texture exists).
 * @return The GL texture id holding the latest decoded frame, or 0 if no frame has been decoded yet.
 */
unsigned int videoInFrame( unsigned int *width, unsigned int *height );

/**
 * @brief Stops playback, destroys the player/sink/audio-output and the GL texture, and resets all state.
 */
void videoInRelease();

#endif
